import fs from 'fs';
import { env } from './config/env';
import { logger } from './utils/logger';
import { initSchema, closeDb } from './database/db';
import { createBot, configureBotMenu } from './bot/bot';
import { startCleanupScheduler, stopCleanupScheduler } from './services/cleanupService';

async function main(): Promise<void> {
  fs.mkdirSync(env.TEMP_DIR, { recursive: true });
  fs.mkdirSync('logs', { recursive: true });

  initSchema();

  const bot = createBot();
  await configureBotMenu(bot);
  startCleanupScheduler();

  await bot.launch();
  logger.info('VidoX bot started', {
    apiRoot: env.TELEGRAM_LOCAL_API,
    maxConcurrentDownloads: env.MAX_CONCURRENT_DOWNLOADS,
  });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    try {
      bot.stop(signal);
      stopCleanupScheduler();
      closeDb();
      logger.info('Shutdown complete.');
    } catch (err) {
      logger.error('Error during shutdown', { error: (err as Error).message });
    } finally {
      process.exit(0);
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: (err as Error).message });
  process.exit(1);
});
