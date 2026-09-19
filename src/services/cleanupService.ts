import { cleanupAbandonedTempDirs } from '../utils/tempDir';
import { logger } from '../utils/logger';

let intervalHandle: NodeJS.Timeout | null = null;

/** Sweeps /TEMP_DIR for abandoned per-job folders every 30 minutes. */
export function startCleanupScheduler(): void {
  const THIRTY_MINUTES = 30 * 60 * 1000;
  intervalHandle = setInterval(() => {
    cleanupAbandonedTempDirs().catch((err) =>
      logger.error('Scheduled cleanup failed', { error: (err as Error).message })
    );
  }, THIRTY_MINUTES);

  // Also run once at startup.
  cleanupAbandonedTempDirs().catch((err) =>
    logger.error('Startup cleanup failed', { error: (err as Error).message })
  );
}

export function stopCleanupScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
