/**
 * Central registry of Telegram Custom Emoji IDs used by VidoX.
 * These are NOT ordinary unicode emoji — they are rendered by Telegram
 * clients via `custom_emoji` message entities that wrap a normal
 * "placeholder" unicode emoji character.
 */
export const CUSTOM_EMOJI = {
  WAVING_HAND: { id: '5472055112702629499', fallback: '👋' },
  THINKING: { id: '5370724846936267183', fallback: '🤔' },
  ROCKET: { id: '5188481279963715781', fallback: '🚀' },
  SPARKLES: { id: '5472164874886846699', fallback: '✨' },
  PAPERCLIP: { id: '5305265301917549162', fallback: '📎' },
  LOADING: { id: '6050887597486513073', fallback: '⏳' },
} as const;
