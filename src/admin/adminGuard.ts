import { Context } from 'telegraf';
import { env } from '../config/env';

export function isAdmin(ctx: Context): boolean {
  return ctx.from?.id === env.ADMIN_TELEGRAM_ID;
}

/**
 * Wraps an admin-only handler. If a non-admin somehow invokes it (e.g. by
 * manually typing an admin command), the message is silently ignored —
 * no error, no hint that the command exists.
 */
export function adminOnly<C extends Context>(
  handler: (ctx: C) => Promise<void>
): (ctx: C) => Promise<void> {
  return async (ctx: C) => {
    if (!isAdmin(ctx)) return;
    await handler(ctx);
  };
}
