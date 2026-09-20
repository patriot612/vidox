# GitHub → Cloudflare Worker + Google Cloud Run

This repository is intentionally a monorepo.

## Cloudflare

Cloudflare Workers Builds can connect the GitHub repository directly. Configure the Worker project root as `worker`.

- Build: `npm install && npm run typecheck`
- Deploy: `npx wrangler deploy`

`worker/wrangler.toml` already contains the D1 binding and Queue consumer/producer configuration.

Before the first deploy, the Queue `vidox-jobs` must exist.

## Cloud Run

Cloud Run continuous deployment can connect to the same GitHub repository through Cloud Build.

Choose Dockerfile build and set:

```text
Dockerfile: downloader/Dockerfile
```

Because the Dockerfile is inside `downloader/`, Cloud Run uses that directory as the Docker build context. This is why `requirements.txt` and `main.py` are in the same directory.

Recommended runtime configuration:

- 2 GiB RAM
- 2 CPU
- concurrency 1
- max instances 2
- timeout 900 seconds

The service must receive these environment variables:

- `BOT_TOKEN`
- `INTERNAL_SECRET`
- `WORKER_CALLBACK_URL`
- `ADMIN_UPLOAD_CHAT_ID`

## Important security note

Do not put production secrets in GitHub files. Cloudflare Worker secrets belong in Cloudflare. Cloud Run secrets should be supplied through Cloud Run/Secret Manager.
