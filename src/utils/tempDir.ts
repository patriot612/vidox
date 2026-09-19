import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from './logger';

/**
 * Creates a unique per-job temp directory so concurrent downloads never
 * collide or interfere with each other's files.
 * Example: /tmp/vidox/<jobId>/
 */
export async function createJobDir(): Promise<{ jobId: string; dir: string }> {
  const jobId = crypto.randomBytes(12).toString('hex');
  const dir = path.join(env.TEMP_DIR, jobId);
  await fs.mkdir(dir, { recursive: true });
  return { jobId, dir };
}

export async function removeJobDir(dir: string): Promise<void> {
  try {
    // Safety check: only ever delete directories inside TEMP_DIR.
    const resolved = path.resolve(dir);
    const base = path.resolve(env.TEMP_DIR);
    if (!resolved.startsWith(base + path.sep)) {
      logger.warn('Refused to delete directory outside TEMP_DIR', { dir: resolved });
      return;
    }
    await fs.rm(resolved, { recursive: true, force: true });
  } catch (err) {
    logger.warn('Failed to remove job directory', { dir, error: (err as Error).message });
  }
}

/** Periodically removes abandoned job directories left behind by crashes. */
export async function cleanupAbandonedTempDirs(): Promise<void> {
  try {
    await fs.mkdir(env.TEMP_DIR, { recursive: true });
    const entries = await fs.readdir(env.TEMP_DIR, { withFileTypes: true });
    const maxAgeMs = env.TEMP_FILE_MAX_AGE_HOURS * 60 * 60 * 1000;
    const now = Date.now();

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(env.TEMP_DIR, entry.name);
      try {
        const stat = await fs.stat(fullPath);
        if (now - stat.mtimeMs > maxAgeMs) {
          await fs.rm(fullPath, { recursive: true, force: true });
          logger.info('Cleaned up abandoned temp directory', { dir: fullPath });
        }
      } catch {
        // entry may have been removed concurrently — ignore
      }
    }
  } catch (err) {
    logger.error('Temp cleanup sweep failed', { error: (err as Error).message });
  }
}
