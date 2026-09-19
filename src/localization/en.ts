import { LocaleStrings } from './types';

export const en: LocaleStrings = {
  welcome: `👋 Hi! I'm VidoX — a bot for downloading videos from TikTok and Instagram straight into Telegram.

🤔 How to use the bot:

1. Find a video you like on TikTok or Instagram.
2. Tap the "Share" button.
3. Copy the link to the post.
4. Send the link here.
5. VidoX will process it and send the video right into this chat.

🚀 Right now I can download from:

• Instagram
• TikTok
• YouTube

✨ What VidoX can do:

• High video quality
• Videos without a watermark
• Fast link processing

📎 Just send me a video link and I'll start downloading.`,

  chooseLanguage: '🌍 Choose your language',

  languageButtons: {
    ru: '🇷🇺 Русский',
    en: '🇬🇧 English',
    uz: '🇺🇿 O‘zbekcha',
  },

  errorGeneric: `⚠️ Couldn't download the video.

Possible reasons:

• 🔒 The account is closed or private
• 🔞 The video is age-restricted
• ⚠️ An error occurred while fetching the data

Try choosing another quality or send a different link.`,

  pausedNotice: '⏸ Downloading is temporarily unavailable. Please try again a bit later.',

  youtubeTooLong: "⚠️ This video is longer than 2 hours, so I can't download it. Try another video.",

  youtubeChooseQuality: '🎬 Choose video quality:',

  unsupportedLink: "⚠️ This link isn't supported. Send a link from TikTok, Instagram, or YouTube.",
};
