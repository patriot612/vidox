import crypto from 'crypto';

interface PendingPreview {
  url: string;
  telegramId: number;
  createdAt: number;
}

const store = new Map<string, PendingPreview>();
const MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

export function registerPreview(url: string, telegramId: number): string {
  const token = crypto.randomBytes(6).toString('hex');
  store.set(token, { url, telegramId, createdAt: Date.now() });
  return token;
}

export function resolvePreview(token: string): PendingPreview | undefined {
  const entry = store.get(token);
  if (!entry) return undefined;
  if (Date.now() - entry.createdAt > MAX_AGE_MS) {
    store.delete(token);
    return undefined;
  }
  return entry;
}

export function discardPreview(token: string): void {
  store.delete(token);
}

// Periodic sweep so the map never grows unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of store.entries()) {
    if (now - entry.createdAt > MAX_AGE_MS) store.delete(token);
  }
}, 5 * 60 * 1000).unref();
