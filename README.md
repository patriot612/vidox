# VidoX — GitHub + Cloudflare + Cloud Run

VidoX is a Telegram bot for downloading public short videos from TikTok, Instagram Reels and YouTube Shorts.

## Supported content

- TikTok: up to 3 minutes
- Instagram Reels: up to 3 minutes
- YouTube Shorts only: up to 3 minutes
- Normal YouTube videos: rejected
- YouTube Live: rejected
- Private/authenticated content: rejected

## Quality policy

- Prefer 1080p when available.
- Otherwise 720p.
- Otherwise the best available quality below 1080p.
- If no format at or below 1080p exists, the downloader uses the best available format without upscaling.
- No quality selector is shown to users.
- Final Telegram upload is limited to 50 MB.

## Architecture

```text
Telegram
   │ webhook
   ▼
Cloudflare Worker
   ├── D1 (users, jobs, waiters, cache)
   └── Cloudflare Queue (vidox-jobs)
          │
          ▼
Google Cloud Run
   ├── Python/FastAPI
   ├── yt-dlp + EJS/Deno
   └── FFmpeg
          │
          ▼
Telegram private upload chat
          │ file_id
          ▼
Cloudflare Worker → D1 cache → user
```

The long-running download never runs inside the Telegram webhook request. The Worker only puts a job on Queue; Cloud Run performs the download and calls the Worker back when the Telegram `file_id` is available.

## Repository layout

```text
vidox/
├── worker/                 # Cloudflare Worker
│   ├── src/
│   ├── wrangler.toml
│   └── package.json
├── downloader/             # Google Cloud Run service
│   ├── main.py
│   ├── Dockerfile
│   └── requirements.txt
├── db/schema.sql           # D1 schema
├── tests/smoke.py          # dependency-free policy checks
├── docs/                   # deployment notes
└── .github/workflows/      # CI checks
```

## Deployment order

### 1. D1

The project is already configured with the VidoX D1 database ID used during setup. The schema is in `db/schema.sql`.

### 2. Cloudflare Queues

Create the main queue before the first Worker deployment:

```bash
npx wrangler queues create vidox-jobs
```

The Worker configuration also declares `vidox-jobs-dlq`; Cloudflare can create a configured dead-letter queue automatically when needed. You can also create it explicitly:

```bash
npx wrangler queues create vidox-jobs-dlq
```

### 3. Cloudflare Worker from GitHub

Cloudflare Workers Builds supports connecting a GitHub repository and automatically deploying on push.

In Cloudflare:

**Workers & Pages → Create application → Import a repository**

Select this GitHub repository.

Set the Worker project root/directory to:

```text
worker
```

Build command:

```text
npm install && npm run typecheck
```

Deploy command:

```text
npx wrangler deploy
```

The Cloudflare Worker name must match `name = "vidox-worker"` in `worker/wrangler.toml`.

### 4. Worker secrets

Configure these in the Cloudflare Worker settings; do not commit them:

```text
BOT_TOKEN
ADMIN_TELEGRAM_ID
DOWNLOADER_URL
INTERNAL_SECRET
WEBHOOK_SECRET
```

### 5. Cloud Run

Use the same GitHub repository as the source for Cloud Run continuous deployment.

In Cloud Run, choose **Connect repository → Cloud Build → GitHub**.

Build type: **Dockerfile**.

Dockerfile source location:

```text
downloader/Dockerfile
```

Cloud Run uses the Dockerfile directory as the build context, so all downloader files are intentionally kept inside `downloader/`.

Recommended service settings:

```text
Memory: 2 GiB
CPU: 2
Concurrency: 1
Maximum instances: 2
Request timeout: 900 seconds
```

Environment variables:

```text
BOT_TOKEN
INTERNAL_SECRET
WORKER_CALLBACK_URL=https://YOUR-WORKER.workers.dev/internal/complete
ADMIN_UPLOAD_CHAT_ID
```

For production, use Google Secret Manager for secrets.

### 6. Telegram webhook

After the Worker is deployed, set the webhook:

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://YOUR-WORKER.workers.dev/telegram" \
  -d "secret_token=<WEBHOOK_SECRET>"
```

## GitHub workflow

Normal development flow:

```text
Edit code → git push → GitHub
                       ├── Cloudflare Workers Builds → Worker
                       └── Cloud Run Cloud Build trigger → Downloader
```

Do not put Telegram tokens, Cloudflare API tokens, Google credentials or `INTERNAL_SECRET` into Git.

## Tests

Python policy checks:

```bash
python tests/smoke.py
```

Worker type check:

```bash
cd worker
npm install
npm run typecheck
```

## Admin commands

```text
/stats
/users
/ban <telegram_id>
/unban <telegram_id>
/banned
/broadcast <text>
/pause
/resume
```
