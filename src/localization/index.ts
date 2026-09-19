import { ru } from './ru';
import { en } from './en';
import { uz } from './uz';
import { LocaleStrings } from './types';
import { Language } from '../database/userRepository';

const locales: Record<Language, LocaleStrings> = { ru, en, uz };

export function t(language: Language): LocaleStrings {
  return locales[language] ?? locales.ru;
}

export { LocaleStrings };
