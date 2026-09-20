import hmac
import logging
import os
import re
import shutil
import subprocess
import tempfile
import time
import urllib.parse
from pathlib import Path
from typing import Literal

import requests
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
import yt_dlp

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("vidox")
app = FastAPI(title="VidoX Downloader", docs_url=None, redoc_url=None, openapi_url=None)

log.info("BGUTIL SERVER EXISTS: %s", Path("/opt/bgutil-ytdlp-pot-provider/server").exists())
log.info("BGUTIL BUILD EXISTS: %s", Path("/opt/bgutil-ytdlp-pot-provider/server/build").exists())

BOT_TOKEN = os.environ["BOT_TOKEN"]
INTERNAL_SECRET = os.environ["INTERNAL_SECRET"]
WORKER_CALLBACK_URL = os.environ["WORKER_CALLBACK_URL"]
ADMIN_UPLOAD_CHAT_ID = os.environ.get("ADMIN_UPLOAD_CHAT_ID", "")

TELEGRAM = f"https://api.telegram.org/bot{BOT_TOKEN}"
MAX_DURATION = 180.0
MAX_UPLOAD_BYTES = 50 * 1024 * 1024


class DownloadPayload(BaseModel):
    job_id: str
    cache_key: str
    url: str
    platform: Literal["tiktok", "instagram", "youtube"]


def _rewind_files(files):
    if not files:
        return
    for value in files.values():
        candidate = value[1] if isinstance(value, tuple) and len(value) > 1 else value
        if hasattr(candidate, "seek"):
            candidate.seek(0)


def tg(method: str, data=None, files=None, timeout=120, retries=4):
    last_error = None
    for attempt in range(retries):
        try:
            _rewind_files(files)
            r = requests.post(f"{TELEGRAM}/{method}", data=data, files=files, timeout=timeout)
            body = r.json()
            if body.get("ok"):
                return body["result"]

            params = body.get("parameters") or {}
            retry_after = params.get("retry_after")
            if body.get("error_code") == 429 and retry_after and attempt < retries - 1:
                time.sleep(min(int(retry_after), 120))
                continue
            raise RuntimeError(body.get("description", "Telegram error"))
        except (requests.RequestException, ValueError) as exc:
            last_error = exc
            if attempt < retries - 1:
                time.sleep(min(2 ** attempt, 16))
                continue
            raise RuntimeError("Telegram network error") from exc
    raise RuntimeError("Telegram request failed") from last_error


def callback(payload: dict, retries: int = 7) -> bool:
    for attempt in range(retries):
        try:
            r = requests.post(
                WORKER_CALLBACK_URL,
                json=payload,
                headers={"x-vidox-secret": INTERNAL_SECRET},
                timeout=30,
            )
            r.raise_for_status()
            return True
        except requests.RequestException:
            if attempt < retries - 1:
                time.sleep(min(2 ** attempt, 30))
    return False


def allowed_host(url: str, platform: str) -> bool:
    try:
        u = urllib.parse.urlsplit(url)
        host = (u.hostname or "").lower().removeprefix("www.")
        if (
            u.scheme != "https"
            or u.username
            or u.password
            or u.port not in (None, 443)
            or u.query
            or u.fragment
            or "\\" in url
            or any(c.isspace() for c in url)
            or len(url) > 300
        ):
            return False
    except ValueError:
        return False

    if platform == "tiktok":
        if host in {"vm.tiktok.com", "vt.tiktok.com"}:
            return bool(re.fullmatch(r"/[\w\-]{4,64}/?", u.path))
        return host == "tiktok.com" and bool(re.fullmatch(r"/(?:@[\w.\-]{1,64}/video/\d{5,25}|t/[\w\-]{4,64})/?", u.path))

    if platform == "instagram":
        return host == "instagram.com" and bool(re.fullmatch(r"/(?:[\w.\-]{1,64}/)?reels?/[\w\-]{5,30}/?", u.path, re.I))

    if platform == "youtube":
        return (
            (host in {"youtube.com", "m.youtube.com"} and bool(re.fullmatch(r"/shorts/[\w\-]{11}/?", u.path, re.I)))
            or (host == "youtu.be" and bool(re.fullmatch(r"/[\w\-]{11}/?", u.path)))
        )
    return False


def resolved_is_short_youtube(info: dict) -> bool:
    candidates = [info.get("webpage_url"), info.get("original_url"), info.get("webpage_url_basename")]
    for value in candidates:
        if not value or not isinstance(value, str):
            continue
        try:
            path = urllib.parse.urlsplit(value).path.lower().rstrip("/")
            if re.fullmatch(r"/shorts/[\w\-]{11}", path, re.I):
                return True
        except ValueError:
            pass
    return False


def is_live(info: dict) -> bool:
    return bool(info.get("is_live")) or info.get("live_status") in {"is_live", "is_upcoming", "post_live"}


def has_usable_sub1080_format(info: dict) -> bool:
    for fmt in info.get("formats") or []:
        height = fmt.get("height")
        if isinstance(height, int) and 0 < height <= 1080 and fmt.get("vcodec") not in (None, "none"):
            return True
    return False


def choose_format(info: dict) -> str:
    if has_usable_sub1080_format(info):
        # Lets yt-dlp choose 1080p when present, then 720p, then the best lower format.
        return "bestvideo[height<=1080]+bestaudio/best[height<=1080]"
    # Explicit exception: when no <=1080 video exists, use the best available format.
    return "bestvideo+bestaudio/best"


def probe(path: Path) -> dict:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries",
            "format=duration:stream=codec_type,codec_name,pix_fmt,width,height",
            "-of", "json", str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    import json
    data = json.loads(result.stdout)
    streams = data.get("streams") or []
    video = next((s for s in streams if s.get("codec_type") == "video"), {})
    audio = next((s for s in streams if s.get("codec_type") == "audio"), {})
    return {
        "duration": float((data.get("format") or {}).get("duration") or 0),
        "v": video.get("codec_name"),
        "pix": video.get("pix_fmt"),
        "a": audio.get("codec_name"),
        "w": int(video.get("width") or 0),
        "h": int(video.get("height") or 0),
    }


def finalize(src: Path, workdir: Path) -> tuple[Path, float]:
    p = probe(src)
    if p["duration"] > MAX_DURATION + 0.5:
        raise RuntimeError("TOO_LONG")
    if not p["w"] or not p["h"]:
        raise RuntimeError("DOWNLOAD_FAILED")

    even = p["w"] % 2 == 0 and p["h"] % 2 == 0
    already_telegram_safe = (
        src.suffix.lower() == ".mp4"
        and p["v"] == "h264"
        and p["pix"] == "yuv420p"
        and p["a"] in (None, "aac")
        and even
    )

    out = src
    if not already_telegram_safe:
        out = workdir / "video.mp4"
        subprocess.run(
            [
                "ffmpeg", "-y", "-nostdin", "-i", str(src),
                "-map", "0:v:0", "-map", "0:a:0?",
                "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
                "-pix_fmt", "yuv420p",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                "-c:a", "aac", "-b:a", "128k",
                "-movflags", "+faststart",
                str(out),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=300,
        )
        if out == src:
            raise RuntimeError("PROCESSING_FAILED")

    size = out.stat().st_size
    if size > MAX_UPLOAD_BYTES:
        raise RuntimeError("TOO_LARGE")
    final_probe = probe(out)
    if final_probe["duration"] > MAX_DURATION + 0.5:
        raise RuntimeError("TOO_LONG")
    return out, final_probe["duration"]


def download(url: str, platform: str, workdir: Path) -> tuple[Path, float]:
    common = {
        "noplaylist": True,
        "playlist_items": "1",
        "quiet": True,
        "no_warnings": True,
        "verbose": True,
        "socket_timeout": 30,
        "retries": 3,
        "fragment_retries": 3,
        "restrictfilenames": True,
        "remote_components": {"ejs:github"},
        "extractor_args": {
            "youtubepot-bgutilhttp": {
                "base_url": "http://127.0.0.1:4416"
            },
            "youtube": {
                "player_client": ["android_vr"]
            },
},
        
         
    }

    inspect_opts = {**common, "skip_download": True}
    with yt_dlp.YoutubeDL(inspect_opts) as ydl:
        info = ydl.extract_info(url, download=False)

    if info.get("_type") in {"playlist", "multi_video"} or info.get("entries"):
        raise RuntimeError("UNSUPPORTED")
    if is_live(info):
        raise RuntimeError("UNSUPPORTED")

    if platform == "youtube" and not resolved_is_short_youtube(info):
        raise RuntimeError("UNSUPPORTED")

    duration = info.get("duration")
    if duration and duration > MAX_DURATION + 0.5:
        raise RuntimeError("TOO_LONG")

    selector = choose_format(info)
    outtmpl = str(workdir / "source.%(ext)s")
    opts = {
        **common,
        "format": selector,
        "outtmpl": outtmpl,
        "merge_output_format": "mp4",
        "max_filesize": MAX_UPLOAD_BYTES,
    }

    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])

    files = [p for p in workdir.glob("source.*") if p.is_file() and not p.name.endswith(".part")]
    if not files:
        raise RuntimeError("NO_FILE")

    source = max(files, key=lambda p: p.stat().st_size)
    return finalize(source, workdir)


def error_code(exc: Exception) -> str:
    value = str(exc)
    if "TOO_LONG" in value:
        return "TOO_LONG"
    if "TOO_LARGE" in value:
        return "TOO_LARGE"
    if "UNSUPPORTED" in value:
        return "UNSUPPORTED"
    return "DOWNLOAD_FAILED"


@app.get("/")
def health():
    return {"ok": True, "service": "vidox-downloader"}


@app.post("/download")
def start_download(payload: DownloadPayload, x_vidox_secret: str = Header(default="")):
    if not INTERNAL_SECRET or not hmac.compare_digest(x_vidox_secret, INTERNAL_SECRET):
        raise HTTPException(status_code=403, detail="forbidden")

    if not allowed_host(payload.url, payload.platform):
        callback({"job_id": payload.job_id, "status": "failed", "error_code": "UNSUPPORTED"})
        return {"accepted": True}

    if not ADMIN_UPLOAD_CHAT_ID:
        callback({"job_id": payload.job_id, "status": "failed", "error_code": "CONFIG"})
        return {"accepted": True}

    workdir = Path(tempfile.mkdtemp(prefix="vidox-"))
    try:
        video, duration = download(payload.url, payload.platform, workdir)
        with video.open("rb") as video_file:
            result = tg(
                "sendVideo",
                data={
                    "chat_id": ADMIN_UPLOAD_CHAT_ID,
                    "caption": "📥 @V1doXBot",
                    "supports_streaming": "true",
                },
                files={"video": ("vidox.mp4", video_file, "video/mp4")},
                timeout=180,
            )
        sent_video = result.get("video") or {}
        file_id = sent_video.get("file_id")
        if not file_id:
            raise RuntimeError("NO_FILE_ID")

        try:
            tg("deleteMessage", data={"chat_id": ADMIN_UPLOAD_CHAT_ID, "message_id": result["message_id"]}, timeout=30)
        except Exception:
            pass

        payload_done = {
            "job_id": payload.job_id,
            "status": "completed",
            "file_id": file_id,
            "file_unique_id": sent_video.get("file_unique_id"),
            "duration": duration,
            "size_bytes": video.stat().st_size,
        }
        if not callback(payload_done):
            log.error("completion callback failed after successful upload; job=%s", payload.job_id)
        return {"accepted": True}

    except Exception as exc:
        code = error_code(exc)
        log.warning("job=%s failed: %s", payload.job_id, type(exc).__name__)
        if not callback({"job_id": payload.job_id, "status": "failed", "error_code": code}):
            log.error("failure callback failed; job=%s", payload.job_id)
        return {"accepted": True}
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
