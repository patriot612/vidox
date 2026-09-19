import { MessageEntity } from 'telegraf/typings/core/types/typegram';

interface EmojiMapping {
  fallback: string;
  id: string;
}

/**
 * Scans `text` for the fallback unicode character of each custom emoji
 * mapping and returns Telegram `custom_emoji` message entities pointing at
 * those positions, so Telegram clients render the actual custom emoji
 * instead of the plain unicode fallback.
 *
 * Each fallback is expected to appear once in the text (which is how all
 * VidoX localized messages are authored). If a fallback isn't found it is
 * simply skipped — the plain unicode emoji still displays correctly.
 */
export function buildEntities(text: string, mappings: EmojiMapping[]): MessageEntity[] {
  const entities: MessageEntity[] = [];

  for (const { fallback, id } of mappings) {
    const offset = text.indexOf(fallback);
    if (offset === -1) continue;

    entities.push({
      type: 'custom_emoji',
      offset,
      // Telegram entity offsets/lengths are UTF-16 code units, same as
      // JavaScript string indexing/length — do NOT use code-point length.
      length: fallback.length,
      custom_emoji_id: id,
    } as MessageEntity);
  }

  return entities;
}
