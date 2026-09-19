import winston from 'winston';
import { env } from '../config/env';

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// NEVER log BOT_TOKEN or other secrets. Helper to redact accidental leaks.
export function redact(text: string): string {
  return text.replace(env_token_pattern(), '[REDACTED]');
}

function env_token_pattern(): RegExp {
  const token = process.env.BOT_TOKEN;
  if (!token) return /$^/; // matches nothing
  return new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
}
