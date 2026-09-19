import { Downloader, DownloadedFile, VideoPreview } from './Downloader';
import { probeInfo, ytDlpDownload } from './ytDlpCommon';

/**
 * TikTok downloads always use the single best available public format.
 * yt-dlp's TikTok extractor already prefers the watermark-free "play
 * addr" variant when the platform exposes one publicly; VidoX never
 * bypasses login/private-account walls to get a cleaner copy.
 */
export class TikTokDownloader implements Downloader {
  async getPreview(url: string): Promise<VideoPreview> {
    const info = await probeInfo(url);
    return {
      title: info.title ?? 'TikTok video',
      thumbnailUrl: info.thumbnail ?? null,
      durationSeconds: info.duration ?? null,
      formats: [],
    };
  }

  async downloadBest(url: string, destDir: string): Promise<DownloadedFile> {
    const filePath = await ytDlpDownload(url, 'bv*+ba/b', destDir);
    return { filePath };
  }

  async downloadFormat(url: string, _formatId: string, destDir: string): Promise<DownloadedFile> {
    // TikTok never exposes a quality picker to the user — always best.
    return this.downloadBest(url, destDir);
  }
}
