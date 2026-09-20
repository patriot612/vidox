export type Lang = "ru" | "en" | "uz";

export const START = {
  ru: `👋 Привет! Я VidoX — бот для скачивания видео из TikTok и Instagram прямо в Telegram.

🤔 Как пользоваться ботом:

1. Найди интересное видео.
2. Нажми «Поделиться».
3. Скопируй ссылку.
4. Отправь ссылку сюда.
5. VidoX скачает видео и отправит его прямо в этот чат.

🚀 Сейчас поддерживаются:

• Instagram Reels
• TikTok
• YouTube Shorts

✨ Возможности:

• Максимально доступное качество
• Без водяного знака, если доступна публичная версия без него
• Быстрая обработка

📎 Просто отправь ссылку на видео.`,

  en: `👋 Hi! I'm VidoX — a bot for downloading videos from TikTok and Instagram directly to Telegram.

🤔 How to use:

1. Find an interesting video.
2. Tap “Share”.
3. Copy the link.
4. Send the link here.
5. VidoX will download the video and send it directly to this chat.

🚀 Currently supported:

• Instagram Reels
• TikTok
• YouTube Shorts

✨ Features:

• Maximum available quality
• No watermark when a public clean version is available
• Fast processing

📎 Just send a video link.`,

  uz: `👋 Salom! Men VidoX — TikTok va Instagram videolarini Telegram orqali yuklab beruvchi botman.

🤔 Qanday foydalaniladi:

1. Qiziqarli videoni toping.
2. «Ulashish» tugmasini bosing.
3. Havolani nusxalang.
4. Havolani shu yerga yuboring.
5. VidoX videoni yuklab, shu chatga yuboradi.

🚀 Hozir qo‘llab-quvvatlanadi:

• Instagram Reels
• TikTok
• YouTube Shorts

✨ Imkoniyatlar:

• Mavjud maksimal sifat
• Ommaviy toza versiya mavjud bo‘lsa, suv belgisisiz
• Tez ishlov berish

📎 Video havolasini yuboring.`,
};

export const UI = {
  choose: { ru: "🌍 Выберите язык", en: "🌍 Choose language", uz: "🌍 Tilni tanlang" },
  loading: { ru: "⏳ Скачиваю видео…", en: "⏳ Downloading video…", uz: "⏳ Video yuklanmoqda…" },
  unsupportedYT: {
    ru: "⚠️ Поддерживаются только YouTube Shorts.",
    en: "⚠️ Only YouTube Shorts are supported.",
    uz: "⚠️ Faqat YouTube Shorts qo‘llab-quvvatlanadi.",
  },
  invalid: {
    ru: "⚠️ Не удалось скачать видео.\n\nВозможные причины:\n• 🔒 Закрытый или приватный аккаунт\n• 🔞 Видео имеет возрастное ограничение\n• ⚠️ Ошибка при получении данных\n\nПопробуйте отправить другую ссылку.",
    en: "⚠️ The video could not be downloaded.\n\nPossible reasons:\n• 🔒 Private account or publication\n• 🔞 Age-restricted video\n• ⚠️ Error while retrieving data\n\nTry another link.",
    uz: "⚠️ Videoni yuklab bo‘lmadi.\n\nMumkin bo‘lgan sabablar:\n• 🔒 Yopiq yoki maxfiy akkaunt\n• 🔞 Yosh cheklovi\n• ⚠️ Ma’lumotlarni olishda xatolik\n\nBoshqa havolani yuborib ko‘ring.",
  },
  rateLimited: {
    ru: "⚠️ Слишком много одновременных загрузок. Дождитесь завершения текущих.",
    en: "⚠️ Too many simultaneous downloads. Please wait for the current ones to finish.",
    uz: "⚠️ Bir vaqtning o‘zida juda ko‘p yuklashlar mavjud. Joriy yuklashlar tugashini kuting.",
  },
  tooLong: {
    ru: "⚠️ Видео длиннее 3 минут — такие видео не поддерживаются.",
    en: "⚠️ Videos longer than 3 minutes are not supported.",
    uz: "⚠️ 3 daqiqadan uzun videolar qo‘llab-quvvatlanmaydi.",
  },
  paused: {
    ru: "⏸ Загрузки временно приостановлены.",
    en: "⏸ Downloads are temporarily paused.",
    uz: "⏸ Yuklashlar vaqtincha to‘xtatilgan.",
  },
  busy: {
    ru: "⚠️ Сейчас высокая нагрузка. Попробуйте через минуту.",
    en: "⚠️ We're busy right now. Please try again in a minute.",
    uz: "⚠️ Hozir yuklama yuqori. Bir daqiqadan so‘ng urinib ko‘ring.",
  },
  tooLarge: {
    ru: "⚠️ Видео слишком большое для отправки через Telegram.",
    en: "⚠️ The video is too large to send through Telegram.",
    uz: "⚠️ Video Telegram orqali yuborish uchun juda katta.",
  },
  banned: {
    ru: "🚫 Доступ ограничен.",
    en: "🚫 Access restricted.",
    uz: "🚫 Kirish cheklangan.",
  },
};

export const EMOJI_IDS = {
  greeting: "5472055112702629499",
  howto: "5370724846936267183",
  supported: "5188481279963715781",
  features: "5472164874886846699",
  send: "5305265301917549162",
  loading: "6050887597486513073",
};

export function langFromCode(code: string): Lang {
  if (code === "en") return "en";
  if (code === "uz") return "uz";
  return "ru";
}

export function languageKeyboard(current: Lang) {
  return {
    inline_keyboard: [[
      { text: `🇷🇺 Русский${current === "ru" ? " ✅" : ""}`, callback_data: "lang:ru" },
      { text: `🇬🇧 English${current === "en" ? " ✅" : ""}`, callback_data: "lang:en" },
      { text: `🇺🇿 O‘zbekcha${current === "uz" ? " ✅" : ""}`, callback_data: "lang:uz" },
    ]],
  };
}
