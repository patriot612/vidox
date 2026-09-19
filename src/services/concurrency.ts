import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Simple counting semaphore that caps how many downloads run at once
 * across all users, so the Oracle Free-Tier VM never gets overloaded.
 * Configurable via MAX_CONCURRENT_DOWNLOADS.
 */
class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<() => void> {
    if (this.active >= this.max) {
      logger.info('Download queue: waiting for a free slot', {
        active: this.active,
        max: this.max,
        queued: this.queue.length,
      });
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active += 1;
    return () => this.release();
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) next();
  }
}

export const downloadSemaphore = new Semaphore(env.MAX_CONCURRENT_DOWNLOADS);
