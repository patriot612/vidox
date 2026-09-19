import { Context } from 'telegraf';
import { detectSupportedLink } from '../services/urlDetector';
import { Language, userRepository } from '../database/userRepository';
import { botStateRepository } from '../database/botStateRepository';
import { t } from '../localization';
import { getDownloader } from '../downloaders/DownloaderFactory';
import { runDownloadJob } from '../services/downloadService';

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

  // All supported sources: best available public quality, no picker.
  await runDownloadJob({
    ctx,
    chatId,
    telegramId,
    language: user.language,
    url: link.url,
    platform: link.platform,
  });
}

