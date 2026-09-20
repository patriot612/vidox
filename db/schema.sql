CREATE TABLE IF NOT EXISTS users (
  telegram_id INTEGER PRIMARY KEY,
  username TEXT,
  language TEXT NOT NULL DEFAULT 'ru',
  first_launch_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  download_count INTEGER NOT NULL DEFAULT 0,
  banned INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings(key,value) VALUES('paused','0');

CREATE TABLE IF NOT EXISTS video_cache (
  cache_key TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  file_unique_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS download_jobs (
  job_id TEXT PRIMARY KEY,
  cache_key TEXT NOT NULL,
  url TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL,
  file_id TEXT,
  file_unique_id TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_download_jobs_cache_status
ON download_jobs(cache_key,status);

CREATE TABLE IF NOT EXISTS job_waiters (
  job_id TEXT NOT NULL,
  chat_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  loading_message_id INTEGER NOT NULL,
  PRIMARY KEY(job_id,chat_id,loading_message_id)
);

CREATE INDEX IF NOT EXISTS idx_job_waiters_job ON job_waiters(job_id);

-- Prevent two concurrent jobs for the same normalized URL from being created by a race.
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_job_per_cache
ON download_jobs(cache_key)
WHERE status IN ('pending','downloading','uploading');


CREATE TABLE IF NOT EXISTS processed_updates (
  update_id INTEGER PRIMARY KEY,
  seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_processed_updates_seen_at ON processed_updates(seen_at);
