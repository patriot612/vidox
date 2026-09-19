import { Downloader, DownloadedFile, VideoPreview } from './Downloader';
import { probeInfo, ytDlpDownload } from './ytDlpCommon';

/**
 * YouTube Shorts downloader. Long-form YouTube URLs are rejected by the URL
 * detector; this downloader always takes the best publicly available video.
 * No intentional re-encoding is performed.
 */
export class YouTubeDownloader implements Downloader {
  async getPreview(url: string): Promise<VideoPreview> {
    const info = await probeInfo(url);
    return {
      title: info.title ?? 'YouTube Short',
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
    return this.downloadBest(url, destDir);
  }
}
