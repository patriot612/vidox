import { Telegraf, Context, Input } from 'telegraf';
import fs from 'fs';
import { createJobDir, removeJobDir } from '../utils/tempDir';
import { downloadSemaphore } from './concurrency';
import { getDownloader, Platform } from '../downloaders/DownloaderFactory';
import { t } from '../localization';
import { Language, userRepository } from '../database/userRepository';
import { CUSTOM_EMOJI } from '../config/customEmoji';
import { buildEntities } from '../bot/messageBuilder';
import { logger } from '../utils/logger';

const CAPTION = '📥 @V1doXBot';

async function showLoading(ctx: Context, chatId: number): Promise<number> {
  const text = `${CUSTOM_EMOJI.LOADING.fallback} ...`;
  const entities = buildEntities(text, [CUSTOM_EMOJI.LOADING]);
  const msg = await ctx.telegram.sendMessage(chatId, text, { entities });
  return msg.message_id;
}

async function clearLoading(ctx: Context, chatId: number, messageId: number): Promise<void> {
  await ctx.telegram.deleteMessage(chatId, messageId).catch(() => undefined);
}

async function sendVideo(ctx: Context, chatId: number, filePath: string): Promise<void> {
  await ctx.telegram.sendVideo(chatId, Input.fromLocalFile(filePath), {
    caption: CAPTION,
    supports_streaming: true,
  });
}

interface RunParams {
  ctx: Context;
  chatId: number;
  telegramId: number;
  language: Language;
  url: string;
  platform: Platform;
  /** Present only for the YouTube "user picked a quality" flow. */
  formatId?: string;
}

/**
 * Shared download → upload → cleanup pipeline used by every platform.
 * Always clears the loading indicator and always deletes the temp file,
 * regardless of success or failure (try/finally).
 */
export async function runDownloadJob(params: RunParams): Promise<void> {
  const { ctx, chatId, telegramId, language, url, platform, formatId } = params;
  const strings = t(language);

  // Show the loading status immediately, even if this job has to wait for
  // an available download slot.
  const loadingMessageId = await showLoading(ctx, chatId);
  const release = await downloadSemaphore.acquire();
  const { dir } = await createJobDir();

  try {
    logger.info('Download started', { telegramId, platform });
    const downloader = getDownloader(platform);

    const result = formatId
      ? await downloader.downloadFormat(url, formatId, dir)
      : await downloader.downloadBest(url, dir);

    logger.info('Download completed, uploading to Telegram', { telegramId, platform });
    await sendVideo(ctx, chatId, result.filePath);
    logger.info('Telegram upload completed', { telegramId, platform });

    userRepository.incrementDownloadCount(telegramId);
  } catch (err) {
    logger.error('Download/upload failed', {
      telegramId,
      platform,
      error: (err as Error).message,
    });
    await ctx.telegram.sendMessage(chatId, strings.errorGeneric).catch(() => undefined);
  } finally {
    await clearLoading(ctx, chatId, loadingMessageId);
    await removeJobDir(dir);
    logger.info('Temporary files deleted', { telegramId, dir });
    release();
  }
}

export function fileExistsSync(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}
