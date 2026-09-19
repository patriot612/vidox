import { Context } from 'telegraf';
import { InlineKeyboardMarkup } from 'telegraf/typings/core/types/typegram';
import { detectSupportedLink } from '../services/urlDetector';
import { Language, userRepository } from '../database/userRepository';
import { botStateRepository } from '../database/botStateRepository';
import { t } from '../localization';
import { env } from '../config/env';
import { getDownloader } from '../downloaders/DownloaderFactory';
import { runDownloadJob } from '../services/downloadService';
import { registerPreview, resolvePreview, discardPreview } from '../services/pendingPreviews';
import { logger } from '../utils/logger';

export async function handleTextMessage(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : undefined;
  if (!telegramId || !chatId || !text) return;

  const user = userRepository.upsertOnActivity(telegramId, ctx.from?.username);
  if (user.is_banned) return; // silently ignore — never reveal ban status

  const strings = t(user.language);

  if (botStateRepository.isPaused()) {
    if (text.includes('http')) {
      await ctx.reply(strings.pausedNotice);
    }
    return;
  }

  const link = detectSupportedLink(text);
  if (!link) {
    if (text.includes('http')) {
      await ctx.reply(strings.unsupportedLink);
    }
    return;
  }

  if (link.platform === 'youtube') {
    await handleYouTubePreview(ctx, chatId, telegramId, link.url, user.language);
    return;
  }

  // TikTok / Instagram: always best available public quality, no picker.
  await runDownloadJob({
    ctx,
    chatId,
    telegramId,
    language: user.language,
    url: link.url,
    platform: link.platform,
  });
}

async function handleYouTubePreview(
  ctx: Context,
  chatId: number,
  telegramId: number,
  url: string,
  language: Language
): Promise<void> {
  const strings = t(language);
  try {
    const downloader = getDownloader('youtube');
    const preview = await downloader.getPreview(url);

    const durationMinutes = (preview.durationSeconds ?? 0) / 60;
    if (preview.durationSeconds && durationMinutes > env.MAX_YOUTUBE_DURATION_MINUTES) {
      await ctx.reply(strings.youtubeTooLong);
      return;
    }

    if (preview.formats.length === 0) {
      await ctx.reply(strings.errorGeneric);
      return;
    }

    const token = registerPreview(url, telegramId);
    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        preview.formats.map((f) => ({
          text: f.label,
          callback_data: `yt:${token}:${f.formatId}`,
        })),
      ],
    };

    const caption = `🎬 ${preview.title}\n\n${strings.youtubeChooseQuality}`;

    if (preview.thumbnailUrl) {
      await ctx.replyWithPhoto(preview.thumbnailUrl, {
        caption,
        reply_markup: keyboard,
      });
    } else {
      await ctx.reply(caption, { reply_markup: keyboard });
    }
  } catch (err) {
    logger.error('YouTube preview failed', { telegramId, error: (err as Error).message });
    await ctx.reply(strings.errorGeneric);
  }
}

export async function handleYouTubeQualityCallback(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  const callbackQuery = ctx.callbackQuery;
  if (!telegramId || !chatId || !callbackQuery || !('data' in callbackQuery)) return;

  const data = callbackQuery.data;
  if (!data.startsWith('yt:')) return;

  const [, token, formatId] = data.split(':');
  const pending = resolvePreview(token);
  await ctx.answerCbQuery();

  const user = userRepository.upsertOnActivity(telegramId, ctx.from?.username);
  const strings = t(user.language);

  if (!pending || pending.telegramId !== telegramId) {
    await ctx.reply(strings.errorGeneric);
    return;
  }

  if (user.is_banned) return;

  discardPreview(token);

  // Remove the preview/quality-selection message before starting the download.
  await ctx.deleteMessage().catch(() => undefined);

  if (botStateRepository.isPaused()) {
    await ctx.reply(strings.pausedNotice);
    return;
  }

  await runDownloadJob({
    ctx,
    chatId,
    telegramId,
    language: user.language,
    url: pending.url,
    platform: 'youtube',
    formatId,
  });
}
