import { Context } from 'telegraf';
import { InlineKeyboardMarkup } from 'telegraf/typings/core/types/typegram';
import { adminOnly } from '../admin/adminGuard';
import { userRepository } from '../database/userRepository';
import { botStateRepository } from '../database/botStateRepository';
import { broadcastText } from '../services/broadcastService';
import { logger } from '../utils/logger';

const PAGE_SIZE = 20;

// Single admin — a simple in-memory flag is enough to track "waiting for
// the next message to broadcast".
let awaitingBroadcast = false;

export function isAwaitingBroadcast(): boolean {
  return awaitingBroadcast;
}

export function clearAwaitingBroadcast(): void {
  awaitingBroadcast = false;
}

export const handleStats = adminOnly(async (ctx: Context) => {
  const totalUsers = userRepository.countAll();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const activeLast24h = userRepository.countActiveSince(since);
  const totalDownloads = userRepository.totalDownloads();

  await ctx.reply(
    `📊 Статистика VidoX\n\n` +
      `👥 Всего пользователей: ${totalUsers}\n` +
      `🟢 Активных за 24 часа: ${activeLast24h}\n` +
      `📥 Всего загрузок: ${totalDownloads}`
  );
});

function usersKeyboard(page: number, hasNext: boolean, bannedOnly: boolean): InlineKeyboardMarkup {
  const prefix = bannedOnly ? 'banned' : 'users';
  const row = [];
  if (page > 0) row.push({ text: '◀️ Назад', callback_data: `${prefix}:${page - 1}` });
  if (hasNext) row.push({ text: '▶️ Далее', callback_data: `${prefix}:${page + 1}` });
  return { inline_keyboard: row.length ? [row] : [] };
}

async function renderUsersPage(
  ctx: Context,
  page: number,
  bannedOnly: boolean,
  edit: boolean
): Promise<void> {
  const offset = page * PAGE_SIZE;
  const users = userRepository.listPage(offset, PAGE_SIZE + 1, bannedOnly);
  const hasNext = users.length > PAGE_SIZE;
  const pageUsers = users.slice(0, PAGE_SIZE);

  const title = bannedOnly ? '🚫 Заблокированные пользователи' : '👥 Пользователи';
  const lines = pageUsers.map((u) => {
    const uname = u.username ? `@${u.username}` : `id:${u.telegram_id}`;
    return `${uname} — ${u.language.toUpperCase()} — загрузок: ${u.download_count}${
      u.is_banned ? ' — 🚫' : ''
    }`;
  });

  const text = pageUsers.length
    ? `${title} (стр. ${page + 1})\n\n${lines.join('\n')}`
    : `${title}\n\nНикого нет.`;

  const keyboard = usersKeyboard(page, hasNext, bannedOnly);

  if (edit) {
    await ctx.editMessageText(text, { reply_markup: keyboard }).catch(() => undefined);
  } else {
    await ctx.reply(text, { reply_markup: keyboard });
  }
}

export const handleUsers = adminOnly(async (ctx: Context) => {
  await renderUsersPage(ctx, 0, false, false);
});

export const handleBanned = adminOnly(async (ctx: Context) => {
  await renderUsersPage(ctx, 0, true, false);
});

export const handleUsersPageCallback = adminOnly(async (ctx: Context) => {
  const cq = ctx.callbackQuery;
  if (!cq || !('data' in cq)) return;
  const [prefix, pageStr] = cq.data.split(':');
  if (prefix !== 'users' && prefix !== 'banned') return;
  await renderUsersPage(ctx, Number(pageStr) || 0, prefix === 'banned', true);
  await ctx.answerCbQuery();
});

function parseTargetId(ctx: Context): number | null {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const parts = text.trim().split(/\s+/);
  const id = Number(parts[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const handleBan = adminOnly(async (ctx: Context) => {
  const targetId = parseTargetId(ctx);
  if (!targetId) {
    await ctx.reply('Использование: /ban <telegram_id>');
    return;
  }
  const changed = userRepository.setBanned(targetId, true);
  await ctx.reply(changed ? `🚫 Пользователь ${targetId} заблокирован.` : 'Пользователь не найден.');
  logger.info('Admin banned user', { targetId });
});

export const handleUnban = adminOnly(async (ctx: Context) => {
  const targetId = parseTargetId(ctx);
  if (!targetId) {
    await ctx.reply('Использование: /unban <telegram_id>');
    return;
  }
  const changed = userRepository.setBanned(targetId, false);
  await ctx.reply(changed ? `✅ Пользователь ${targetId} разблокирован.` : 'Пользователь не найден.');
  logger.info('Admin unbanned user', { targetId });
});

export const handlePause = adminOnly(async (ctx: Context) => {
  botStateRepository.setPaused(true);
  await ctx.reply('⏸ Загрузка видео приостановлена.');
  logger.info('Admin paused downloading');
});

export const handleResume = adminOnly(async (ctx: Context) => {
  botStateRepository.setPaused(false);
  await ctx.reply('▶️ Загрузка видео возобновлена.');
  logger.info('Admin resumed downloading');
});

export const handleBroadcastStart = adminOnly(async (ctx: Context) => {
  awaitingBroadcast = true;
  await ctx.reply('✉️ Отправьте сообщение для рассылки всем пользователям.');
});

/** Called from the generic text handler when awaitingBroadcast is true. */
export async function handleBroadcastMessage(ctx: Context): Promise<void> {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : undefined;
  clearAwaitingBroadcast();
  if (!text) {
    await ctx.reply('⚠️ Рассылка отменена: сообщение должно быть текстовым.');
    return;
  }

  await ctx.reply('📤 Рассылка началась...');
  const result = await broadcastText(ctx.telegram, text);
  await ctx.reply(`✅ Рассылка завершена. Отправлено: ${result.sent}, ошибок: ${result.failed}`);
  logger.info('Broadcast completed', result);
}
