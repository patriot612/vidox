import type { Env, TelegramUpdate, CompleteRequest, JobMessage } from "./types";
import { sendMessage, deleteMessage, sendVideoByFileId, answerCallback, tg } from "./telegram";
import { START, UI, EMOJI_IDS, langFromCode, languageKeyboard, type Lang } from "./i18n";

const STALE_JOB_MINUTES = 45;
const MAX_ACTIVE_JOBS_PER_USER = 2;
const MAX_GLOBAL_ACTIVE_JOBS = 4;

function customEmoji(id: string, fallback: string) {
  return `<tg-emoji emoji-id="${id}">${fallback}</tg-emoji>`;
}

function withCustomEmoji(text: string) {
  return text
    .replace("👋", customEmoji(EMOJI_IDS.greeting, "👋"))
    .replace("🤔", customEmoji(EMOJI_IDS.howto, "🤔"))
    .replace("🚀", customEmoji(EMOJI_IDS.supported, "🚀"))
    .replace("✨", customEmoji(EMOJI_IDS.features, "✨"))
    .replace("📎", customEmoji(EMOJI_IDS.send, "📎"));
}

function loadingText() {
  return customEmoji(EMOJI_IDS.loading, "⏳") + " Скачиваю видео…";
}

function classify(raw: string): { url: string; platform: "tiktok" | "instagram" | "youtube" } | "yt_unsupported" | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" || u.username || u.password || u.port && u.port !== "443") return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");

    if (["tiktok.com", "vm.tiktok.com", "vt.tiktok.com"].includes(host)) {
      const ok = host === "tiktok.com"
        ? /^\/(?:@[\w.\-]{1,64}\/video\/\d{5,25}|t\/[\w\-]{4,64})$/.test(path)
        : /^\/[\w\-]{4,64}$/.test(path);
      return ok ? { url: `https://${host}${path}`, platform: "tiktok" } : null;
    }

    if (host === "instagram.com") {
      const m = path.match(/^\/(?:[\w.\-]{1,64}\/)?reels?\/([\w\-]{5,30})$/i);
      return m ? { url: `https://instagram.com/reel/${m[1]}`, platform: "instagram" } : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (/^\/shorts\/[\w\-]{11}$/i.test(path)) {
        return { url: `https://youtube.com${path}`, platform: "youtube" };
      }
      return "yt_unsupported";
    }

    if (host === "youtu.be") {
      const m = path.match(/^\/([\w\-]{11})$/);
      if (m) return { url: `https://youtube.com/shorts/${m[1]}`, platform: "youtube" };
      return "yt_unsupported";
    }

    return null;
  } catch {
    return null;
  }
}

function cacheKey(platform: string, url: string) {
  return `${platform}:${url}`;
}

async function getLang(env: Env, userId: number): Promise<Lang> {
  const row = await env.DB.prepare("SELECT language FROM users WHERE telegram_id = ?").bind(userId).first<{ language: string }>();
  return langFromCode(row?.language ?? "ru");
}

async function ensureUser(env: Env, msg: NonNullable<TelegramUpdate["message"]>) {
  const user = msg.from;
  if (!user) return;
  await env.DB.prepare(`
    INSERT INTO users (telegram_id, username, language, first_launch_at, last_activity_at)
    VALUES (?, ?, 'ru', datetime('now'), datetime('now'))
    ON CONFLICT(telegram_id) DO UPDATE SET
      username=excluded.username,
      last_activity_at=datetime('now')
  `).bind(user.id, user.username ?? null).run();
}

async function isBanned(env: Env, userId: number) {
  const row = await env.DB.prepare("SELECT banned FROM users WHERE telegram_id = ?").bind(userId).first<{ banned: number }>();
  return row?.banned === 1;
}

async function startFlow(env: Env, msg: NonNullable<TelegramUpdate["message"]>) {
  const userId = msg.from!.id;
  const lang = await getLang(env, userId);
  await sendMessage(env, msg.chat.id, withCustomEmoji(START[lang]), { parse_mode: "HTML" });
  await new Promise(r => setTimeout(r, 2000));
  await sendMessage(env, msg.chat.id, UI.choose[lang], { reply_markup: languageKeyboard(lang) });
}

async function handleLanguageCallback(env: Env, update: TelegramUpdate) {
  const cb = update.callback_query;
  if (!cb?.data?.startsWith("lang:") || !cb.message) return false;
  const lang = langFromCode(cb.data.slice(5));
  await env.DB.prepare("UPDATE users SET language=?, last_activity_at=datetime('now') WHERE telegram_id=?")
    .bind(lang, cb.from.id).run();
  try {
    await tg(env, "editMessageText", {
      chat_id: cb.message.chat.id,
      message_id: cb.message.message_id,
      text: UI.choose[lang],
      reply_markup: languageKeyboard(lang),
    });
  } catch (e) {
    if (!(e instanceof Error && /message is not modified/i.test(e.message))) throw e;
  }
  await answerCallback(env, cb.id);
  return true;
}

function adminOnly(env: Env, userId: number) {
  return Boolean(env.ADMIN_TELEGRAM_ID) && String(userId) === String(env.ADMIN_TELEGRAM_ID);
}

async function adminCommand(env: Env, msg: NonNullable<TelegramUpdate["message"]>, _ctx: ExecutionContext) {
  if (!msg.text || !msg.from || !adminOnly(env, msg.from.id)) return false;
  const parts = msg.text.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase().split("@")[0];
  const arg = parts.slice(1).join(" ").trim();
  if (!cmd.startsWith("/")) return false;

  if (cmd === "/stats") {
    const row = await env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM users) total,
        (SELECT COUNT(*) FROM users WHERE last_activity_at >= datetime('now','-1 day')) active,
        (SELECT COALESCE(SUM(download_count),0) FROM users) downloads
    `).first<any>();
    await sendMessage(env, msg.chat.id,
      `📊 Статистика VidoX\n👥 Всего пользователей: ${row?.total ?? 0}\n🟢 Активных за 24 часа: ${row?.active ?? 0}\n📥 Всего загрузок: ${row?.downloads ?? 0}`);
    return true;
  }

  if (cmd === "/users") {
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<any>();
    await sendMessage(env, msg.chat.id, `👥 Пользователей: ${row?.n ?? 0}`);
    return true;
  }

  if ((cmd === "/ban" || cmd === "/unban") && /^\d{1,15}$/.test(arg)) {
    if (cmd === "/ban" && arg === String(env.ADMIN_TELEGRAM_ID)) {
      await sendMessage(env, msg.chat.id, "Нельзя заблокировать администратора.");
      return true;
    }
    await env.DB.prepare(`
      INSERT INTO users(telegram_id,first_launch_at,last_activity_at,banned)
      VALUES(?,datetime('now'),datetime('now'),?)
      ON CONFLICT(telegram_id) DO UPDATE SET banned=excluded.banned
    `).bind(Number(arg), cmd === "/ban" ? 1 : 0).run();
    await sendMessage(env, msg.chat.id, cmd === "/ban" ? `🚫 Заблокирован: ${arg}` : `✅ Разблокирован: ${arg}`);
    return true;
  }

  if (cmd === "/banned") {
    const rows = await env.DB.prepare("SELECT telegram_id FROM users WHERE banned=1 ORDER BY telegram_id").all<{ telegram_id: number }>();
    await sendMessage(env, msg.chat.id, `🚫 Заблокированных: ${rows.results.map(r => r.telegram_id).join(", ") || "нет"}`);
    return true;
  }

  if (cmd === "/broadcast") {
    if (!arg) {
      await sendMessage(env, msg.chat.id, "Использование: /broadcast текст сообщения");
      return true;
    }
    await env.JOBS.send({ kind: "broadcast", text: arg, after: 0 });
    await sendMessage(env, msg.chat.id, "📢 Рассылка запущена.");
    return true;
  }

  if (cmd === "/pause") {
    await env.DB.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('paused','1')").run();
    await sendMessage(env, msg.chat.id, "⏸ Загрузки временно приостановлены.");
    return true;
  }

  if (cmd === "/resume") {
    await env.DB.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('paused','0')").run();
    await sendMessage(env, msg.chat.id, "▶️ Загрузки возобновлены.");
    return true;
  }

  return false;
}

function errorText(lang: Lang, errorCode?: string) {
  if (errorCode === "TOO_LARGE") return UI.tooLarge[lang];
  if (errorCode === "TOO_LONG") return UI.tooLong[lang];
  if (errorCode === "PAUSED") return UI.paused[lang];
  return UI.invalid[lang];
}

async function notifyAndDeleteWaiters(env: Env, jobId: string, errorCode = "DOWNLOAD_FAILED") {
  const waiters = await env.DB.prepare("SELECT chat_id,user_id,loading_message_id FROM job_waiters WHERE job_id=?").bind(jobId).all<any>();
  for (const w of waiters.results) {
    const lang = await getLang(env, Number(w.user_id));
    try { await sendMessage(env, Number(w.chat_id), errorText(lang, errorCode)); } catch {}
    await deleteMessage(env, Number(w.chat_id), Number(w.loading_message_id));
  }
  await env.DB.prepare("DELETE FROM job_waiters WHERE job_id=?").bind(jobId).run();
}

async function recoverStaleJob(env: Env, job: any) {
  const r = await env.DB.prepare(`
    UPDATE download_jobs SET status='failed', error_code='STALE_JOB', finished_at=datetime('now')
    WHERE job_id=? AND status IN ('pending','downloading','uploading')
  `).bind(job.job_id).run();
  if (r.meta.changes) await notifyAndDeleteWaiters(env, job.job_id, "DOWNLOAD_FAILED");
}

async function handleLink(env: Env, msg: NonNullable<TelegramUpdate["message"]>) {
  const chatId = msg.chat.id;
  const userId = msg.from!.id;
  const lang = await getLang(env, userId);
  const classification = classify(msg.text!.trim());

  if (classification === null) {
    await sendMessage(env, chatId, UI.invalid[lang]);
    return;
  }
  if (classification === "yt_unsupported") {
    await sendMessage(env, chatId, UI.unsupportedYT[lang]);
    return;
  }

  const { url: normalized, platform } = classification;
  const paused = await env.DB.prepare("SELECT value FROM settings WHERE key='paused'").first<{ value: string }>();
  if (paused?.value === "1") {
    await sendMessage(env, chatId, UI.paused[lang]);
    return;
  }

  const activeForUser = await env.DB.prepare(`
    SELECT COUNT(*) AS n FROM job_waiters w
    JOIN download_jobs j ON j.job_id=w.job_id
    WHERE w.user_id=? AND j.status IN ('pending','downloading','uploading')
  `).bind(userId).first<{ n: number }>();
  if ((activeForUser?.n ?? 0) >= MAX_ACTIVE_JOBS_PER_USER) {
    await sendMessage(env, chatId, UI.rateLimited[lang]);
    return;
  }

  const busy = await env.DB.prepare(`SELECT COUNT(*) AS n FROM download_jobs WHERE status IN ('pending','downloading','uploading')`).first<{ n: number }>();
  if ((busy?.n ?? 0) >= MAX_GLOBAL_ACTIVE_JOBS) {
    await sendMessage(env, chatId, UI.busy[lang]);
    return;
  }

  const loading = await sendMessage(env, chatId, loadingText(), { parse_mode: "HTML" });
  const key = cacheKey(platform, normalized);

  const cached = await env.DB.prepare(`SELECT file_id FROM video_cache WHERE cache_key=? AND expires_at > datetime('now')`)
    .bind(key).first<{ file_id: string }>();
  if (cached?.file_id) {
    try {
      await sendVideoByFileId(env, chatId, cached.file_id);
      await env.DB.prepare("UPDATE users SET download_count=download_count+1,last_activity_at=datetime('now') WHERE telegram_id=?").bind(userId).run();
      await deleteMessage(env, chatId, loading.message_id);
      return;
    } catch {
      await env.DB.prepare("DELETE FROM video_cache WHERE cache_key=?").bind(key).run();
    }
  }

  let existing = await env.DB.prepare(`
    SELECT job_id, status, created_at FROM download_jobs
    WHERE cache_key=? AND status IN ('pending','downloading','uploading')
    ORDER BY created_at DESC LIMIT 1
  `).bind(key).first<any>();

  if (existing) {
    const stale = await env.DB.prepare("SELECT COUNT(*) AS n FROM download_jobs WHERE job_id=? AND created_at < datetime('now', ?)")
      .bind(existing.job_id, `-${STALE_JOB_MINUTES} minutes`).first<{ n: number }>();
    if (stale?.n) {
      await recoverStaleJob(env, existing);
      existing = null;
    }
  }

  if (existing) {
    await env.DB.prepare(`INSERT INTO job_waiters(job_id,chat_id,user_id,loading_message_id) VALUES(?,?,?,?)`)
      .bind(existing.job_id, chatId, userId, loading.message_id).run();
    return;
  }

  const jobId = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO download_jobs(job_id,cache_key,url,platform,status,created_at) VALUES(?,?,?,?, 'pending', datetime('now'))`)
        .bind(jobId, key, normalized, platform),
      env.DB.prepare(`INSERT INTO job_waiters(job_id,chat_id,user_id,loading_message_id) VALUES(?,?,?,?)`)
        .bind(jobId, chatId, userId, loading.message_id),
    ]);
  } catch {
    const winner = await env.DB.prepare(`SELECT job_id FROM download_jobs WHERE cache_key=? AND status IN ('pending','downloading','uploading') ORDER BY created_at DESC LIMIT 1`)
      .bind(key).first<{ job_id: string }>();
    if (!winner) {
      await deleteMessage(env, chatId, loading.message_id);
      await sendMessage(env, chatId, UI.invalid[lang]);
      return;
    }
    await env.DB.prepare(`INSERT INTO job_waiters(job_id,chat_id,user_id,loading_message_id) VALUES(?,?,?,?)`)
      .bind(winner.job_id, chatId, userId, loading.message_id).run();
    return;
  }

  try {
    await env.JOBS.send({ kind: "download", job_id: jobId, cache_key: key, url: normalized, platform });
  } catch {
    await env.DB.prepare(`UPDATE download_jobs SET status='failed', error_code='DOWNLOADER_UNAVAILABLE', finished_at=datetime('now') WHERE job_id=? AND status='pending'`).bind(jobId).run();
    await notifyAndDeleteWaiters(env, jobId, "DOWNLOAD_FAILED");
  }
}

async function completeJob(env: Env, body: CompleteRequest) {
  if (!body?.job_id || !["completed", "failed"].includes(body.status)) return new Response("bad request", { status: 400 });
  const job = await env.DB.prepare("SELECT * FROM download_jobs WHERE job_id=?").bind(body.job_id).first<any>();
  if (!job) return new Response("not found", { status: 404 });
  if (["completed", "failed", "cancelled"].includes(job.status)) return new Response("ok");
  if (body.status === "completed" && !body.file_id) return new Response("missing file_id", { status: 400 });

  const upd = await env.DB.prepare(`
    UPDATE download_jobs SET status=?, file_id=?, file_unique_id=?, error_code=?, finished_at=datetime('now')
    WHERE job_id=? AND status IN ('pending','downloading','uploading')
  `).bind(body.status, body.file_id ?? null, body.file_unique_id ?? null, body.error_code ?? null, body.job_id).run();
  if (!upd.meta.changes) return new Response("ok");

  if (body.status === "completed" && body.file_id) {
    await env.DB.prepare(`INSERT OR REPLACE INTO video_cache(cache_key,file_id,file_unique_id,created_at,expires_at) VALUES(?,?,?,datetime('now'),datetime('now','+30 days'))`)
      .bind(job.cache_key, body.file_id, body.file_unique_id ?? null).run();
  }

  const waiters = await env.DB.prepare("SELECT chat_id,user_id,loading_message_id FROM job_waiters WHERE job_id=?").bind(body.job_id).all<any>();
  for (const w of waiters.results) {
    const lang = await getLang(env, Number(w.user_id));
    try {
      if (body.status === "completed" && body.file_id) {
        await sendVideoByFileId(env, Number(w.chat_id), body.file_id);
        await env.DB.prepare("UPDATE users SET download_count=download_count+1,last_activity_at=datetime('now') WHERE telegram_id=?").bind(w.user_id).run();
      } else {
        await sendMessage(env, Number(w.chat_id), errorText(lang, body.error_code));
      }
    } catch {
      try { await sendMessage(env, Number(w.chat_id), UI.invalid[lang]); } catch {}
    }
    await deleteMessage(env, Number(w.chat_id), Number(w.loading_message_id));
  }
  await env.DB.prepare("DELETE FROM job_waiters WHERE job_id=?").bind(body.job_id).run();
  return new Response("ok");
}

async function broadcastChunk(env: Env, text: string, after: number) {
  const rows = await env.DB.prepare("SELECT telegram_id FROM users WHERE banned=0 AND telegram_id>? ORDER BY telegram_id LIMIT 25")
    .bind(after).all<{ telegram_id: number }>();
  for (const r of rows.results) {
    try {
      await sendMessage(env, r.telegram_id, text);
    } catch {}
    await new Promise(r => setTimeout(r, 50));
  }
  if (rows.results.length === 25) {
    await env.JOBS.send({ kind: "broadcast", text, after: rows.results[24].telegram_id }, { delaySeconds: 1 });
  }
}

async function sweep(env: Env) {
  const stale = await env.DB.prepare(`SELECT job_id FROM download_jobs WHERE status IN ('pending','downloading','uploading') AND created_at < datetime('now', ?) LIMIT 50`)
    .bind(`-${STALE_JOB_MINUTES} minutes`).all<any>();
  for (const j of stale.results) await recoverStaleJob(env, j);
  await env.DB.prepare("DELETE FROM processed_updates WHERE seen_at < datetime('now','-2 days')").run();
  await env.DB.prepare("DELETE FROM video_cache WHERE expires_at <= datetime('now')").run();
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/telegram") {
      if (!env.WEBHOOK_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) return new Response("forbidden", { status: 403 });
      let update: TelegramUpdate;
      try { update = await request.json() as TelegramUpdate; } catch { return new Response("bad request", { status: 400 }); }

      const seen = await env.DB.prepare(
        "INSERT OR IGNORE INTO processed_updates(update_id,seen_at) VALUES(?,datetime('now'))"
      ).bind(update.update_id).run();
      if (!seen.meta.changes) return new Response("ok");

      if (update.callback_query) {
        await handleLanguageCallback(env, update);
        return new Response("ok");
      }

      if (update.message) {
        await ensureUser(env, update.message);
        if (update.message.from && await isBanned(env, update.message.from.id)) {
          const lang = await getLang(env, update.message.from.id);
          await sendMessage(env, update.message.chat.id, UI.banned[lang]);
          return new Response("ok");
        }
        if (await adminCommand(env, update.message, ctx)) return new Response("ok");
        if (/^\/start(?:@\w+)?(?:\s|$)/i.test(update.message.text ?? "")) {
          ctx.waitUntil(startFlow(env, update.message));
        } else if (update.message.text) {
          await handleLink(env, update.message);
        }
      }
      return new Response("ok");
    }

    if (request.method === "POST" && url.pathname === "/internal/complete") {
      if (!env.INTERNAL_SECRET || request.headers.get("x-vidox-secret") !== env.INTERNAL_SECRET) return new Response("forbidden", { status: 403 });
      let body: CompleteRequest;
      try { body = await request.json() as CompleteRequest; } catch { return new Response("bad request", { status: 400 }); }
      return completeJob(env, body);
    }

    return new Response("VidoX Worker OK", { status: 200 });
  },

  async queue(batch: MessageBatch<JobMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const body = message.body;
      if (body.kind === "broadcast") {
        try {
          await broadcastChunk(env, body.text, body.after);
          message.ack();
        } catch {
          message.retry({ delaySeconds: Math.min(300, 30 * Math.max(1, message.attempts)) });
        }
        continue;
      }

      const claim = await env.DB.prepare("UPDATE download_jobs SET status='downloading' WHERE job_id=? AND status='pending'")
        .bind(body.job_id).run();
      if (!claim.meta.changes) {
        message.ack();
        continue;
      }

      try {
        const response = await fetch(`${env.DOWNLOADER_URL.replace(/\/$/, "")}/download`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-vidox-secret": env.INTERNAL_SECRET },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(14 * 60 * 1000),
        });
        if (!response.ok) throw new Error(`downloader_http_${response.status}`);
        message.ack();
      } catch {
        if (message.attempts >= 3) {
          await env.DB.prepare("UPDATE download_jobs SET status='failed', error_code='DOWNLOADER_UNAVAILABLE', finished_at=datetime('now') WHERE job_id=? AND status='downloading'").bind(body.job_id).run();
          await notifyAndDeleteWaiters(env, body.job_id, "DOWNLOAD_FAILED");
          message.ack();
        } else {
          await env.DB.prepare("UPDATE download_jobs SET status='pending', error_code=NULL WHERE job_id=? AND status='downloading'").bind(body.job_id).run();
          message.retry({ delaySeconds: Math.min(300, 30 * Math.max(1, message.attempts)) });
        }
      }
    }
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(sweep(env));
  },
};
