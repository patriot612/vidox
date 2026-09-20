"""Small dependency-free smoke checks for VidoX URL/limit policy."""
import re

MAX_DURATION = 180


def classify(url: str):
    from urllib.parse import urlsplit
    u = urlsplit(url.strip())
    if u.scheme != "https" or u.username or u.password or u.port not in (None, 443):
        return None
    host = (u.hostname or "").lower().removeprefix("www.")
    path = u.path.rstrip("/")
    if host in {"youtube.com", "m.youtube.com"}:
        return "youtube" if re.fullmatch(r"/shorts/[\w-]{11}", path, re.I) else "yt_unsupported"
    if host == "youtu.be":
        return "youtube_candidate" if re.fullmatch(r"/[\w-]{11}", path) else "yt_unsupported"
    if host == "instagram.com":
        return "instagram" if re.fullmatch(r"/(?:[\w.\-]{1,64}/)?reels?/[\w\-]{5,30}", path, re.I) else None
    if host in {"tiktok.com", "vm.tiktok.com", "vt.tiktok.com"}:
        return "tiktok"
    return None


assert classify("https://youtube.com/shorts/abcdefghijk") == "youtube"
assert classify("https://youtube.com/watch?v=abcdefghijk") == "yt_unsupported"
assert classify("https://youtu.be/abcdefghijk") == "youtube_candidate"
assert classify("https://instagram.com/reel/ABC12345") == "instagram"
assert classify("https://www.tiktok.com/@user/video/12345678901") == "tiktok"
assert classify("http://youtube.com/shorts/abcdefghijk") is None
assert MAX_DURATION == 180
print("VidoX smoke policy checks: OK")
