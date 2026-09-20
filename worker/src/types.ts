export interface Env {
  DB: D1Database;
  JOBS: Queue<JobMessage>;
  BOT_TOKEN: string;
  ADMIN_TELEGRAM_ID: string;
  DOWNLOADER_URL: string;
  INTERNAL_SECRET: string;
  WEBHOOK_SECRET: string;
  ENVIRONMENT?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number; username?: string; first_name?: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number };
    data?: string;
    message?: { chat: { id: number }; message_id: number };
  };
}

export interface CompleteRequest {
  job_id: string;
  status: "completed" | "failed";
  file_id?: string;
  file_unique_id?: string;
  duration?: number;
  size_bytes?: number;
  error_code?: string;
}

export type JobMessage =
  | { kind: "download"; job_id: string; cache_key: string; url: string; platform: "tiktok" | "instagram" | "youtube" }
  | { kind: "broadcast"; text: string; after: number };
