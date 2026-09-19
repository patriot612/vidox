import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const env = {
  BOT_TOKEN: required('BOT_TOKEN'),
  ADMIN_TELEGRAM_ID: Number(required('ADMIN_TELEGRAM_ID')),
  TELEGRAM_LOCAL_API: process.env.TELEGRAM_LOCAL_API || 'http://127.0.0.1:8081',
  DATABASE_PATH: process.env.DATABASE_PATH || path.resolve(process.cwd(), 'data/vidox.db'),
  TEMP_DIR: process.env.TEMP_DIR || '/tmp/vidox',
  NODE_ENV: process.env.NODE_ENV || 'production',
  MAX_CONCURRENT_DOWNLOADS: optionalNumber('MAX_CONCURRENT_DOWNLOADS', 3),
  TEMP_FILE_MAX_AGE_HOURS: optionalNumber('TEMP_FILE_MAX_AGE_HOURS', 2),
};

if (!Number.isInteger(env.ADMIN_TELEGRAM_ID) || env.ADMIN_TELEGRAM_ID <= 0) {
  throw new Error('ADMIN_TELEGRAM_ID must be a positive integer Telegram user ID');
}
