import { Downloader, DownloadedFile, VideoFormat, VideoPreview } from './Downloader';
import { probeInfo, ytDlpDownload, RawFormat } from './ytDlpCommon';

const TARGET_HEIGHTS = [1080, 720, 480, 360];

export class YouTubeDownloader implements Downloader {
  async getPreview(url: string): Promise<VideoPreview> {
    const info = await probeInfo(url);
    const raw = info.formats ?? [];

    // For each target height, keep the best video-only (or progressive)
    // format available at/near that height. yt-dlp will pair it with the
    // best audio automatically at download time via "<id>+bestaudio".
    const byHeight = new Map<number, RawFormat>();
    for (const f of raw) {
      if (!f.height || f.vcodec === 'none') continue;
      if (!TARGET_HEIGHTS.includes(f.height)) continue;
      const existing = byHeight.get(f.height);
      if (!existing || (f.filesize ?? f.filesize_approx ?? 0) > (existing.filesize ?? existing.filesize_approx ?? 0)) {
        byHeight.set(f.height, f);
      }
    }

    const formats: VideoFormat[] = TARGET_HEIGHTS.filter((h) => byHeight.has(h)).map((h) => {
      const f = byHeight.get(h)!;
      return {
        formatId: f.format_id,
        height: h,
        label: `${h}p`,
        hasAudio: f.acodec !== 'none' && !!f.acodec,
      };
    });

    return {
      title: info.title ?? 'YouTube video',
      thumbnailUrl: info.thumbnail ?? null,
      durationSeconds: info.duration ?? null,
      formats,
    };
  }

  async downloadBest(url: string, destDir: string): Promise<DownloadedFile> {
    const filePath = await ytDlpDownload(url, 'bv*[height<=1080]+ba/b[height<=1080]', destDir);
    return { filePath };
  }

  async downloadFormat(url: string, formatId: string, destDir: string): Promise<DownloadedFile> {
    // Keep the exact selected video format. If it is video-only, pair it
    // with an audio track. The video quality is never changed by the audio
    // fallback. Prefer M4A audio so the final MP4 remux is broadly compatible.
    const info = await probeInfo(url);
    const selected = (info.formats ?? []).find((f) => f.format_id === formatId);
    if (!selected) throw new Error('Selected YouTube format is no longer available');

    const hasAudio = selected.acodec !== 'none' && !!selected.acodec;
    const selector = hasAudio
      ? formatId
      : `${formatId}+bestaudio[ext=m4a]/${formatId}+bestaudio/${formatId}`;
    const filePath = await ytDlpDownload(url, selector, destDir);
    return { filePath };
  }
}
