import { Downloader } from './Downloader';
import { TikTokDownloader } from './TikTokDownloader';
import { InstagramDownloader } from './InstagramDownloader';
import { YouTubeDownloader } from './YouTubeDownloader';

export type Platform = 'tiktok' | 'instagram' | 'youtube';

const instances: Record<Platform, Downloader> = {
  tiktok: new TikTokDownloader(),
  instagram: new InstagramDownloader(),
  youtube: new YouTubeDownloader(),
};

export function getDownloader(platform: Platform): Downloader {
  return instances[platform];
}
