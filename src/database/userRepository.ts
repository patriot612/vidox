import { db } from './db';

export type Language = 'ru' | 'en' | 'uz';

export interface User {
  telegram_id: number;
  username: string | null;
  language: Language;
  first_seen_at: string;
  last_active_at: string;
  download_count: number;
  is_banned: number;
}

export const userRepository = {
  findById(telegramId: number): User | undefined {
    return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as
      | User
      | undefined;
  },

  upsertOnActivity(telegramId: number, username: string | undefined): User {
    const now = new Date().toISOString();
    const existing = this.findById(telegramId);

    if (existing) {
      db.prepare(
        'UPDATE users SET username = ?, last_active_at = ? WHERE telegram_id = ?'
      ).run(username ?? existing.username, now, telegramId);
      return this.findById(telegramId)!;
    }

    db.prepare(
      `INSERT INTO users (telegram_id, username, language, first_seen_at, last_active_at, download_count, is_banned)
       VALUES (?, ?, 'ru', ?, ?, 0, 0)`
    ).run(telegramId, username ?? null, now, now);
    return this.findById(telegramId)!;
  },

  setLanguage(telegramId: number, language: Language): void {
    db.prepare('UPDATE users SET language = ? WHERE telegram_id = ?').run(language, telegramId);
  },

  incrementDownloadCount(telegramId: number): void {
    db.prepare('UPDATE users SET download_count = download_count + 1 WHERE telegram_id = ?').run(
      telegramId
    );
  },

  setBanned(telegramId: number, banned: boolean): boolean {
    const result = db
      .prepare('UPDATE users SET is_banned = ? WHERE telegram_id = ?')
      .run(banned ? 1 : 0, telegramId);
    return result.changes > 0;
  },

  isBanned(telegramId: number): boolean {
    const user = this.findById(telegramId);
    return !!user && user.is_banned === 1;
  },

  countAll(): number {
    const row = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
    return row.c;
  },

  countActiveSince(isoDate: string): number {
    const row = db
      .prepare('SELECT COUNT(*) as c FROM users WHERE last_active_at >= ?')
      .get(isoDate) as { c: number };
    return row.c;
  },

  totalDownloads(): number {
    const row = db.prepare('SELECT COALESCE(SUM(download_count), 0) as c FROM users').get() as {
      c: number;
    };
    return row.c;
  },

  listPage(offset: number, limit: number, bannedOnly = false): User[] {
    const clause = bannedOnly ? 'WHERE is_banned = 1' : '';
    return db
      .prepare(`SELECT * FROM users ${clause} ORDER BY first_seen_at DESC LIMIT ? OFFSET ?`)
      .all(limit, offset) as User[];
  },

  countBanned(): number {
    const row = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_banned = 1').get() as {
      c: number;
    };
    return row.c;
  },

  allIds(): number[] {
    const rows = db.prepare('SELECT telegram_id FROM users ORDER BY first_seen_at ASC').all() as {
      telegram_id: number;
    }[];
    return rows.map((r) => r.telegram_id);
  },

  allActiveIds(): number[] {
    const rows = db.prepare('SELECT telegram_id FROM users WHERE is_banned = 0').all() as {
      telegram_id: number;
    }[];
    return rows.map((r) => r.telegram_id);
  },
};
