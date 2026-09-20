import type { Env } from "./types";

const api = (env: Env, method: string) => `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`;

export async function tg<T = any>(
  env: Env,
  method: string,
  body: Record<string, unknown>,
  retries = 4,
): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const r = await fetch(api(env, method), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json() as any;
    if (data.ok) return data.result as T;

    const retryAfter = Number(data.parameters?.retry_after ?? 0);
    if ((data.error_code === 429 || r.status >= 500) && attempt < retries - 1) {
      const delay = retryAfter > 0 ? Math.min(retryAfter, 120) * 1000 : Math.min(2 ** attempt, 16) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    throw new Error(`Telegram API error: ${data.description ?? "unknown"}`);
  }
  throw new Error("Telegram API retry limit reached");
}

export async function sendMessage(env: Env, chat_id: number, text: string, extra: Record<string, unknown> = {}) {
  return tg(env, "sendMessage", { chat_id, text, ...extra });
}

export async function editMessage(env: Env, chat_id: number, message_id: number, text: string, extra: Record<string, unknown> = {}) {
  return tg(env, "editMessageText", { chat_id, message_id, text, ...extra });
}

export async function deleteMessage(env: Env, chat_id: number, message_id: number) {
  try { await tg(env, "deleteMessage", { chat_id, message_id }); } catch {}
}

export async function sendVideoByFileId(env: Env, chat_id: number, file_id: string) {
  return tg(env, "sendVideo", { chat_id, video: file_id, caption: "📥 @V1doXBot" });
}

export async function answerCallback(env: Env, callback_query_id: string) {
  return tg(env, "answerCallbackQuery", { callback_query_id });
}
