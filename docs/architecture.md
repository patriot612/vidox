# VidoX v3 architecture

```text
Telegram
  │
  ▼
Cloudflare Worker (/telegram)
  │
  ├── D1: users / jobs / waiters / cache
  │
  └── Queue: vidox-jobs
          │
          ▼
      Cloud Run downloader
          │
          ├── yt-dlp + EJS/Deno
          ├── FFmpeg
          └── Telegram sendVideo to private upload chat
                    │
                    ▼
                 file_id
                    │
                    ▼
             Worker /internal/complete
                    │
                    ├── D1 cache
                    └── sendVideo(file_id) to waiter(s)
```

### Queue behavior

- One download message represents one normalized URL/job.
- Consumer concurrency: 2.
- A transient Cloud Run/network failure resets the job to `pending` and retries the Queue message.
- After the final retry, the job is failed and all waiters are notified.
- Completion callbacks are idempotent because terminal jobs ignore late callbacks.

### YouTube

Worker accepts `/shorts/<11-char-id>` and `youtu.be/<11-char-id>` candidates. The downloader then resolves the URL with yt-dlp and accepts it only if the resolved page is a YouTube Shorts page. This prevents ordinary `youtu.be` videos from becoming supported accidentally.
