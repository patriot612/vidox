import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { logger } from '../utils/logger';

fs.mkdirSync(path.dirname(env.DATABASE_PATH), { recursive: true });

export const db = new Database(env.DATABASE_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id INTEGER PRIMARY KEY,
      username TEXT,
      language TEXT NOT NULL DEFAULT 'ru',
      first_seen_at TEXT NOT NULL,
      last_active_at TEXT NOT NULL,
      download_count INTEGER NOT NULL DEFAULT 0,
      is_banned INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bot_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active_at);
  `);

  // Default: downloads are enabled unless explicitly paused by admin.
  const paused = db.prepare('SELECT value FROM bot_state WHERE key = ?').get('paused');
  if (!paused) {
    db.prepare('INSERT INTO bot_state (key, value) VALUES (?, ?)').run('paused', '0');
  }

  logger.info('Database schema ready', { path: env.DATABASE_PATH });
}

export function closeDb(): void {
  db.close();
}
