import { Platform } from '../downloaders/DownloaderFactory';

const URL_REGEX = /https?:\/\/[^\s]+/gi;

const HOST_PATTERNS: { platform: Platform; hosts: RegExp }[] = [
  { platform: 'tiktok', hosts: /(^|\.)tiktok\.com$/i },
  { platform: 'instagram', hosts: /(^|\.)instagram\.com$/i },
  {
    platform: 'youtube',
    hosts: /(^|\.)(youtube\.com|youtu\.be|m\.youtube\.com|music\.youtube\.com)$/i,
  },
];

export interface DetectedLink {
  url: string;
  platform: Platform;
}

/** Extracts the first supported (TikTok/Instagram/YouTube) URL from free text. */
export function detectSupportedLink(text: string): DetectedLink | null {
  const matches = text.match(URL_REGEX);
  if (!matches) return null;

  for (const raw of matches) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;

    for (const { platform, hosts } of HOST_PATTERNS) {
      if (hosts.test(url.hostname)) {
        return { url: url.toString(), platform };
      }
    }
  }

  return null;
}
