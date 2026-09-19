import { Context } from 'telegraf';
import { t } from '../localization';
import { CUSTOM_EMOJI } from '../config/customEmoji';
import { buildEntities } from '../bot/messageBuilder';
import { userRepository } from '../database/userRepository';
import { languageKeyboard } from './language';

const LANGUAGE_PROMPT_DELAY_MS = 2000;

export async function handleStart(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  userRepository.upsertOnActivity(telegramId, ctx.from?.username);

  // Russian welcome is always sent first, regardless of any previously
  // saved language — /start always begins the same way.
  const strings = t('ru');
  const entities = buildEntities(strings.welcome, [
    CUSTOM_EMOJI.WAVING_HAND,
    CUSTOM_EMOJI.THINKING,
    CUSTOM_EMOJI.ROCKET,
    CUSTOM_EMOJI.SPARKLES,
    CUSTOM_EMOJI.PAPERCLIP,
  ]);

  await ctx.reply(strings.welcome, { entities });

  setTimeout(async () => {
    try {
      await ctx.reply(strings.chooseLanguage, {
        reply_markup: languageKeyboard(null),
      });
    } catch {
      // chat may have become unavailable (user blocked the bot, etc.) — ignore
    }
  }, LANGUAGE_PROMPT_DELAY_MS);
}
