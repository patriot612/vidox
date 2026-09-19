import { Telegram } from 'telegraf';
import { userRepository } from '../database/userRepository';
import { logger } from '../utils/logger';

export interface BroadcastResult {
  sent: number;
  failed: number;
}

/**
 * Sends a message to every registered user, including banned users. Users
 * who blocked the bot or otherwise can't be reached are skipped without
 * crashing the broadcast for everyone else.
 */
export async function broadcastText(telegram: Telegram, text: string): Promise<BroadcastResult> {
  const ids = userRepository.allIds();
  let sent = 0;
  let failed = 0;

  for (const id of ids) {
    try {
      await telegram.sendMessage(id, text);
      sent += 1;
    } catch (err) {
      failed += 1;
      logger.warn('Broadcast delivery failed for user', {
        telegramId: id,
        error: (err as Error).message,
      });
    }
    // Gentle pacing to stay well within Telegram's rate limits.
    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  return { sent, failed };
}
