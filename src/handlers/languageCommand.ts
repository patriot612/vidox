import { Context } from 'telegraf';
import { t } from '../localization';
import { userRepository } from '../database/userRepository';
import { languageKeyboard } from './language';

/** Triggered by the single public menu command: 🌐 Language */
export async function handleLanguageCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const user = userRepository.upsertOnActivity(telegramId, ctx.from?.username);
  const strings = t('ru');

  await ctx.reply(strings.chooseLanguage, {
    reply_markup: languageKeyboard(user.language),
  });
}
