import { Context } from 'telegraf';
import { InlineKeyboardMarkup } from 'telegraf/typings/core/types/typegram';
import { t } from '../localization';
import { Language, userRepository } from '../database/userRepository';
import { CUSTOM_EMOJI } from '../config/customEmoji';
import { buildEntities } from '../bot/messageBuilder';

const LANGS: Language[] = ['ru', 'en', 'uz'];

function labelFor(lang: Language, selected: Language | null): string {
  const strings = t('ru'); // button labels are identical across all locales
  const base = strings.languageButtons[lang];
  return lang === selected ? `${base} ✅` : base;
}

export function languageKeyboard(selected: Language | null): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      LANGS.map((lang) => ({
        text: labelFor(lang, selected),
        callback_data: `lang:${lang}`,
      })),
    ],
  };
}

export async function handleLanguageCallback(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  const callbackQuery = ctx.callbackQuery;
  if (!telegramId || !callbackQuery || !('data' in callbackQuery)) return;

  const data = callbackQuery.data;
  if (!data.startsWith('lang:')) return;

  const language = data.split(':')[1] as Language;
  if (!LANGS.includes(language)) {
    await ctx.answerCbQuery();
    return;
  }

  userRepository.upsertOnActivity(telegramId, ctx.from?.username);
  userRepository.setLanguage(telegramId, language);

  const strings = t('ru');
  try {
    await ctx.editMessageText(strings.chooseLanguage, {
      reply_markup: languageKeyboard(language),
    });
  } catch {
    // message may be too old to edit — non-fatal
  }
  await ctx.answerCbQuery();

  // Russian welcome was already sent by /start — never resend it.
  if (language === 'ru') return;

  const localized = t(language);
  const entities = buildEntities(localized.welcome, [
    CUSTOM_EMOJI.WAVING_HAND,
    CUSTOM_EMOJI.THINKING,
    CUSTOM_EMOJI.ROCKET,
    CUSTOM_EMOJI.SPARKLES,
    CUSTOM_EMOJI.PAPERCLIP,
  ]);
  await ctx.reply(localized.welcome, { entities });
}
