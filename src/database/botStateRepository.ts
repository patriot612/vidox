import { db } from './db';

export const botStateRepository = {
  isPaused(): boolean {
    const row = db.prepare('SELECT value FROM bot_state WHERE key = ?').get('paused') as
      | { value: string }
      | undefined;
    return row?.value === '1';
  },

  setPaused(paused: boolean): void {
    db.prepare('INSERT INTO bot_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
      'paused',
      paused ? '1' : '0'
    );
  },
};
