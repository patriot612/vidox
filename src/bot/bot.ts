import { Telegraf } from 'telegraf';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { handleStart } from '../handlers/start';
import { handleLanguageCallback } from '../handlers/language';
import { handleLanguageCommand } from '../handlers/languageCommand';
import { handleTextMessage } from '../handlers/message';
import {
  handleStats,
  handleUsers,
  handleBanned,
  handleUsersPageCallback,
  handleBan,
  handleUnban,
  handlePause,
  handleResume,
  handleBroadcastStart,
  handleBroadcastMessage,
  isAwaitingBroadcast,
} from '../handlers/admin';
import { isAdmin } from '../admin/adminGuard';

export function createBot(): Telegraf {
  const bot = new Telegraf(env.BOT_TOKEN, {
    telegram: { apiRoot: env.TELEGRAM_LOCAL_API },
  });

  // ---- Public commands ----
  bot.start(handleStart);
  bot.command('language', handleLanguageCommand);

  // ---- Admin commands (hidden from the public menu; guarded internally) ----
  bot.command('stats', handleStats);
  bot.command('users', handleUsers);
  bot.command('banned', handleBanned);
  bot.command('ban', handleBan);
  bot.command('unban', handleUnban);
  bot.command('pause', handlePause);
  bot.command('resume', handleResume);
  bot.command('broadcast', handleBroadcastStart);

  // ---- Callback queries ----
  bot.action(/^lang:/, handleLanguageCallback);
  bot.action(/^(users|banned):/, handleUsersPageCallback);

  // ---- Free text: admin broadcast capture takes priority, then normal flow ----
  bot.on('text', async (ctx) => {
    if (isAdmin(ctx) && isAwaitingBroadcast()) {
      await handleBroadcastMessage(ctx);
      return;
    }
    await handleTextMessage(ctx);
  });

  bot.catch((err, ctx) => {
    logger.error('Unhandled bot error', {
      error: (err as Error).message,
      updateType: ctx.updateType,
    });
  });

  return bot;
}

/** Only "🌐 Language" is exposed in the Telegram menu — nothing else. */
export async function configureBotMenu(bot: Telegraf): Promise<void> {
  await bot.telegram.setMyCommands([{ command: 'language', description: '🌐 Language' }]);
}
