export interface DownloadedFile {
  filePath: string;
  /** Human-readable label like "720p", used only for logging. */
  qualityLabel?: string;
}

export interface VideoFormat {
  /** yt-dlp format id/selector to pass to -f */
  formatId: string;
  height: number;
  label: string; // e.g. "1080p"
  hasAudio: boolean;
}

export interface VideoPreview {
  title: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  formats: VideoFormat[];
}

/**
 * Common contract every platform-specific downloader implements.
 * Telegram handlers only ever talk to this interface — never to
 * platform internals — so downloaders stay swappable/testable.
 */
export interface Downloader {
  /** Best-effort probe of available info before actually downloading. */
  getPreview(url: string): Promise<VideoPreview>;

  /**
   * Downloads the best available public, watermark-free version into
   * `destDir` and returns the resulting file path. Used by platforms
   * (TikTok, Instagram) that don't expose a quality picker to the user.
   */
  downloadBest(url: string, destDir: string): Promise<DownloadedFile>;

  /** Downloads exactly the given format id (from getPreview) into destDir. */
  downloadFormat(url: string, formatId: string, destDir: string): Promise<DownloadedFile>;
}
