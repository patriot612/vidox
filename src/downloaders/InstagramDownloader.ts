import { Downloader, DownloadedFile, VideoPreview } from './Downloader';
import { probeInfo, ytDlpDownload } from './ytDlpCommon';

/**
 * Instagram downloads always use the single best publicly available
 * format. Private accounts and login-gated content are never accessed.
 */
export class InstagramDownloader implements Downloader {
  async getPreview(url: string): Promise<VideoPreview> {
    const info = await probeInfo(url);
    return {
      title: info.title ?? 'Instagram video',
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
