import fs from 'fs/promises';
import path from 'path';
import { runCommand } from '../utils/shell';
import { logger } from '../utils/logger';

const YT_DLP_BIN = process.env.YT_DLP_PATH || 'yt-dlp';
const FFMPEG_BIN = process.env.FFMPEG_PATH || 'ffmpeg';

export interface RawFormat {
  format_id: string;
  ext: string;
  height?: number;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  filesize_approx?: number;
}

export interface RawInfo {
  title?: string;
  thumbnail?: string;
  duration?: number;
  formats?: RawFormat[];
}

/** Runs `yt-dlp -j <url>` and parses the resulting metadata JSON. */
export async function probeInfo(url: string): Promise<RawInfo> {
  const { stdout } = await runCommand(YT_DLP_BIN, [
    '-j',
    '--no-warnings',
    '--no-playlist',
    url,
  ]);
  return JSON.parse(stdout) as RawInfo;
}

/**
 * Downloads a video with yt-dlp using the given format selector into
 * destDir, then remuxes to a faststart MP4 (stream copy, no re-encode)
 * so Telegram reliably recognizes it as a playable video.
 */
export async function ytDlpDownload(
  url: string,
  formatSelector: string,
  destDir: string
): Promise<string> {
  const outputTemplate = path.join(destDir, 'source.%(ext)s');

  await runCommand(YT_DLP_BIN, [
    '-f',
    formatSelector,
    '--no-playlist',
    '--no-warnings',
    '--merge-output-format',
    'mp4',
    '-o',
    outputTemplate,
    url,
  ]);

  const files = await fs.readdir(destDir);
  const downloaded = files.find((f) => f.startsWith('source.'));
  if (!downloaded) {
    throw new Error('yt-dlp reported success but produced no output file');
  }

  const downloadedPath = path.join(destDir, downloaded);
  const finalPath = path.join(destDir, 'output.mp4');

  if (downloaded.endsWith('.mp4')) {
    // Fast, lossless: just move faststart metadata to the front.
    await runCommand(FFMPEG_BIN, [
      '-y',
      '-i',
      downloadedPath,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      finalPath,
    ]);
  } else {
    // Non-mp4 container (e.g. webm) — remux into mp4 without re-encoding
    // when the codecs allow it; ffmpeg will error out if truly incompatible,
    // in which case the caller's generic error handling takes over.
    await runCommand(FFMPEG_BIN, [
      '-y',
      '-i',
      downloadedPath,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      finalPath,
    ]);
  }

  await fs.unlink(downloadedPath).catch(() => undefined);
  logger.info('yt-dlp download + remux complete', { destDir });
  return finalPath;
}
