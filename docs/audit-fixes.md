# VidoX v3 audit fixes

This version is based on the uploaded VidoX v2 project and fixes the blockers found during the audit.

## Fixed

1. Long-running downloader calls moved from Worker `waitUntil()` to Cloudflare Queue.
2. Queue retry resets `downloading` back to `pending` before retrying.
3. Queue has bounded concurrency of 2 to match Cloud Run's two-instance/concurrency-1 target.
4. Downloader failures are terminal after three failed Queue attempts and waiters receive an error instead of hanging indefinitely.
5. Telegram 429 handling honors `retry_after` in Worker and Cloud Run.
6. Current yt-dlp YouTube EJS requirements are included via `yt-dlp[default]` plus Deno.
7. YouTube is validated after yt-dlp resolution so `youtu.be/<id>` is accepted only when it resolves to a real `/shorts/<id>` page.
8. Ordinary YouTube videos and Live content are rejected.
9. The 3-minute limit is checked before download and again on the final file.
10. Final files are normalized to Telegram-friendly MP4/H.264/yuv420p when necessary.
11. `processed_updates` was added to D1 and webhook updates are deduplicated.
12. `/pause` has its own localized message.
13. `TOO_LONG` has its own localized message.
14. Broadcast was moved to Queue instead of relying on long `waitUntil()` execution.
15. Cloud Run completion callback is retried independently after a successful Telegram upload.
16. Dockerfile uses a pinned Deno image tag instead of an unpinned floating tag.
17. TypeScript/Cloudflare Worker development dependencies were added.

## Deliberate behavior

- YouTube long videos are never a supported download target.
- TikTok and Instagram downloads are limited to 3 minutes.
- No permanent video storage is used.
- No attempt is made to bypass private/authenticated content.
