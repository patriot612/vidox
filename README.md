# VidoX — Telegram Video Downloader Bot

VidoX (`@V1doXBot`) downloads **public** videos from TikTok, Instagram, and
YouTube and delivers them straight into a Telegram chat as native video
messages. It runs as a plain Node.js/TypeScript service on your own VM —
no serverless platforms, no third-party hosting.

- Telegram bot layer: [Telegraf](https://telegraf.js.org/)
- Media extraction: [yt-dlp](https://github.com/yt-dlp/yt-dlp) (actively
  maintained, supports TikTok/Instagram/YouTube public content)
- Remux to faststart MP4: [FFmpeg](https://ffmpeg.org/)
- Storage: SQLite (`better-sqlite3`) for users/stats only — videos are
  never stored, only streamed through a per-job temp folder and deleted
  immediately after upload
- Large files (up to 2GB): [Telegram Bot API — Local Server](https://github.com/tdlib/telegram-bot-api)

> VidoX never bypasses private accounts, logins, or DRM. It only works
> with content that is already public.

---

## 1. Project layout

```
vidox/
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── README.md
└── src/
    ├── index.ts                 # entrypoint, graceful shutdown
    ├── config/
    │   ├── env.ts                # environment variable loading/validation
    │   └── customEmoji.ts        # Telegram custom emoji ID registry
    ├── bot/
    │   ├── bot.ts                 # Telegraf wiring: commands, actions
    │   └── messageBuilder.ts      # builds custom_emoji message entities
    ├── handlers/
    │   ├── start.ts               # /start welcome flow
    │   ├── language.ts            # language inline-keyboard + callback
    │   ├── languageCommand.ts     # /language menu command
    │   ├── message.ts             # URL detection, YouTube preview/quality
    │   └── admin.ts               # /stats /users /ban /unban /banned
    │                               # /broadcast /pause /resume
    ├── admin/
    │   └── adminGuard.ts          # ADMIN_TELEGRAM_ID-only guard
    ├── downloaders/
    │   ├── Downloader.ts          # common interface
    │   ├── ytDlpCommon.ts         # shared yt-dlp/ffmpeg execution
    │   ├── TikTokDownloader.ts
    │   ├── InstagramDownloader.ts
    │   ├── YouTubeDownloader.ts
    │   └── DownloaderFactory.ts
    ├── services/
    │   ├── urlDetector.ts         # supported-link detection
    │   ├── downloadService.ts     # download → upload → cleanup pipeline
    │   ├── concurrency.ts         # MAX_CONCURRENT_DOWNLOADS semaphore
    │   ├── cleanupService.ts      # abandoned temp-file sweeper
    │   ├── pendingPreviews.ts     # short-lived YouTube quality tokens
    │   └── broadcastService.ts    # /broadcast delivery
    ├── database/
    │   ├── db.ts                  # SQLite connection + schema
    │   ├── userRepository.ts
    │   └── botStateRepository.ts  # pause/resume flag
    ├── localization/
    │   ├── types.ts
    │   ├── ru.ts / en.ts / uz.ts
    │   └── index.ts
    └── utils/
        ├── logger.ts               # winston logger (never logs secrets)
        ├── shell.ts                # execFile-only, no shell injection
        └── tempDir.ts               # per-job temp dirs + cleanup
```

---

## 2. Environment variables

Copy `.env.example` to `.env` and fill it in:

```
BOT_TOKEN=123456:your-real-bot-token
ADMIN_TELEGRAM_ID=123456789
TELEGRAM_LOCAL_API=http://127.0.0.1:8081
DATABASE_PATH=./data/vidox.db
TEMP_DIR=/tmp/vidox
NODE_ENV=production
MAX_CONCURRENT_DOWNLOADS=3
MAX_YOUTUBE_DURATION_MINUTES=120
TEMP_FILE_MAX_AGE_HOURS=2
```

- `BOT_TOKEN` — from [@BotFather](https://t.me/BotFather).
- `ADMIN_TELEGRAM_ID` — **your** numeric Telegram user ID (get it from
  [@userinfobot](https://t.me/userinfobot)). Only this ID can use admin
  commands.
- `TELEGRAM_LOCAL_API` — base URL of your self-hosted Telegram Bot API
  server (see §5). Required to upload files larger than 50MB, up to 2GB.

Never commit `.env` — it's already in `.gitignore`.

---

## 3. Oracle Cloud Always Free VM — base setup

These steps assume a fresh **Ubuntu 24.04** instance (Oracle's
"VM.Standard.E2.1.Micro" or "Ampere A1" Always Free shapes both work).

### 3.1 Connect and update

```bash
ssh ubuntu@<your-vm-public-ip>
sudo apt update && sudo apt -y upgrade
```

### 3.2 Install Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # should print v20.x
npm -v
```

### 3.3 Install Git, FFmpeg, and build tools

```bash
sudo apt install -y git ffmpeg build-essential python3 python3-pip
```

### 3.4 Install yt-dlp

```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
yt-dlp --version
```

Keep yt-dlp updated regularly (platforms change often):

```bash
sudo yt-dlp -U
```

### 3.5 Open the firewall (if you expose anything publicly)

VidoX itself makes only outbound connections (to Telegram and to
TikTok/Instagram/YouTube), so no inbound port needs to be opened for the
bot process. If you also run the Local Bot API server on the same VM, it
only needs to be reachable from `127.0.0.1`, so no firewall changes are
required for a same-host setup.

---

## 4. Deploy VidoX from GitHub

### 4.1 Push the project to GitHub (from your own machine)

```bash
git init
git add .
git commit -m "Initial VidoX commit"
git branch -M main
git remote add origin https://github.com/<your-username>/vidox.git
git push -u origin main
```

### 4.2 Clone it on the Oracle VM

```bash
cd ~
git clone https://github.com/<your-username>/vidox.git
cd vidox
```

### 4.3 Configure environment

```bash
cp .env.example .env
nano .env    # fill in BOT_TOKEN, ADMIN_TELEGRAM_ID, etc.
```

### 4.4 Install dependencies and build

```bash
npm install
npm run build
```

This compiles `src/` (TypeScript) into `dist/` (plain JS) per
`tsconfig.json`.

### 4.5 Test-run it once in the foreground

```bash
node dist/index.js
```

You should see `VidoX bot started` in the console. Press `Ctrl+C` to stop
it, then set it up as a proper service (next section).

---

## 5. Telegram Local Bot API Server (required for large files)

The standard `api.telegram.org` Bot API caps file uploads at 50MB. To
send videos up to **2GB**, you need to run your own instance of
[`telegram-bot-api`](https://github.com/tdlib/telegram-bot-api), the
official local server implementation, and point VidoX at it via
`TELEGRAM_LOCAL_API`.

### 5.1 Get API credentials

Create an application at <https://my.telegram.org/apps> to obtain an
`api_id` and `api_hash` (these are separate from your bot token — every
Local Bot API server instance needs them).

### 5.2 If this bot previously used the normal Telegram Bot API

Before switching the bot to the Local Bot API server, log the bot out from Telegram's cloud Bot API. Run this once (replace the token when prompted):

```bash
read -rsp "BOT_TOKEN: " BOT_TOKEN; echo
curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/logOut"
unset BOT_TOKEN
```

A successful response should contain `"ok":true`. Do this before starting the local server for the first time.

### 5.3 Build from source on Ubuntu 24.04

```bash
sudo apt install -y make git zlib1g-dev libssl-dev gperf cmake g++ php-cli

git clone --recursive https://github.com/tdlib/telegram-bot-api.git
cd telegram-bot-api
rm -rf build
mkdir build && cd build

cmake -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/usr/local ..
cmake --build . -j$(nproc)
sudo cmake --install .
```

This installs the `telegram-bot-api` binary at the fixed path
`/usr/local/bin/telegram-bot-api`, which is also the path used by the
systemd service below. Verify it with:

```bash
command -v telegram-bot-api
telegram-bot-api --help | head
```

> Building TDLib takes a while (20–40+ minutes) on a free-tier VM's
> limited CPU — this is normal, let it finish.

### 5.4 Run it

```bash
telegram-bot-api \
  --api-id=<your_api_id> \
  --api-hash=<your_api_hash> \
  --local \
  --http-port=8081
```

`--local` enables local-mode features (larger file limits, access to
files on disk). `--http-port=8081` matches the default
`TELEGRAM_LOCAL_API=http://127.0.0.1:8081` in `.env.example`.

### 5.5 Verify it's running

```bash
curl "http://127.0.0.1:8081/bot<BOT_TOKEN>/getMe"
```

You should get back a JSON object describing your bot.

### 5.6 Run it as a systemd service

```bash
sudo tee /etc/systemd/system/telegram-bot-api.service > /dev/null << 'EOF'
[Unit]
Description=Telegram Bot API Local Server
After=network.target

[Service]
Type=simple
User=ubuntu
ExecStart=/usr/local/bin/telegram-bot-api --api-id=<your_api_id> --api-hash=<your_api_hash> --local --http-port=8081
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now telegram-bot-api
sudo systemctl status telegram-bot-api
```

Replace `ExecStart` with the actual path from step 5.2 if different, and
put your real `api_id`/`api_hash` in (never commit these to Git).

---

## 6. Run VidoX as a systemd service

```bash
sudo tee /etc/systemd/system/vidox.service > /dev/null << 'EOF'
[Unit]
Description=VidoX Telegram Bot
After=network.target telegram-bot-api.service
Wants=telegram-bot-api.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/vidox
ExecStart=/usr/bin/node dist/index.js
EnvironmentFile=/home/ubuntu/vidox/.env
Restart=always
RestartSec=5
StandardOutput=append:/home/ubuntu/vidox/logs/service.log
StandardError=append:/home/ubuntu/vidox/logs/service.log

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now vidox
sudo systemctl status vidox
```

VidoX will now:
- start automatically on VM reboot
- restart automatically if it crashes (`Restart=always`)
- start only after the Local Bot API service is up

View live logs:

```bash
journalctl -u vidox -f
```

---

## 7. Updating VidoX from GitHub

Whenever you push changes to GitHub, update the VM like this:

```bash
cd ~/vidox
git pull
npm install
npm run build
sudo systemctl restart vidox
```

```
GitHub
  ↓
git pull
  ↓
npm install
  ↓
npm run build
  ↓
systemctl restart vidox
```

---

## 8. Database backup

VidoX only ever stores lightweight user/stats data in SQLite — never
video files. Back up just the database file:

```bash
mkdir -p ~/vidox-backups
sqlite3 ~/vidox/data/vidox.db ".backup '$HOME/vidox-backups/vidox-$(date +%Y%m%d-%H%M%S).db'"
```

You can put this in a daily cron job:

```bash
crontab -e
# Add this line for a daily 3:00 AM backup:
0 3 * * * sqlite3 /home/ubuntu/vidox/data/vidox.db ".backup '/home/ubuntu/vidox-backups/vidox-$(date +\%Y\%m\%d).db'"
```

---

## 9. Temporary file cleanup

Every download gets its own directory: `/tmp/vidox/<job-id>/`. Files are
deleted immediately after a successful Telegram upload, a failed
download, or any unexpected error (`try/finally` in
`services/downloadService.ts`). In addition, a background sweep
(`services/cleanupService.ts`) runs every 30 minutes and removes any
leftover job directories older than `TEMP_FILE_MAX_AGE_HOURS` (default 2
hours) — this catches anything left behind by a crash.

---

## 10. Admin commands

Only the Telegram account matching `ADMIN_TELEGRAM_ID` can use these.
They are **not** listed in the bot's command menu and are silently
ignored if anyone else types them:

| Command | Description |
|---|---|
| `/stats` | Total users, active in last 24h, total downloads |
| `/users` | Paginated user list (20 per page) |
| `/banned` | Paginated list of banned users |
| `/ban <telegram_id>` | Ban a user |
| `/unban <telegram_id>` | Unban a user |
| `/broadcast` | Prompts for a message, then sends it to all users |
| `/pause` | Temporarily disable downloading for everyone |
| `/resume` | Re-enable downloading |

The public Telegram menu button only ever shows **🌐 Language**.

---

## 11. Notes on quality/behavior

- **TikTok / Instagram**: always downloads the single best public,
  watermark-free version available — no quality picker is shown.
- **YouTube**: shows a preview (thumbnail, title) with quality buttons in
  the order **1080p → 720p → 480p → 360p**, only for resolutions that
  actually exist for that video. Whatever the user taps is downloaded
  exactly — never silently swapped for another quality. Videos over 2
  hours are rejected before any download starts.
- All errors shown to users are generic, localized (RU/EN/UZ) messages —
  no stack traces, HTTP codes, or internal details are ever exposed.

---

## 12. Troubleshooting

- **Bot doesn't respond**: check `journalctl -u vidox -f` and
  `journalctl -u telegram-bot-api -f`.
- **Uploads fail for large files**: confirm `TELEGRAM_LOCAL_API` in
  `.env` matches the port the local Bot API server is actually listening
  on, and that the service is running (`systemctl status
  telegram-bot-api`).
- **Downloads fail for a specific platform**: run
  `yt-dlp -v <url>` manually on the VM to see the underlying error, then
  update yt-dlp (`sudo yt-dlp -U`) — extractors break when platforms
  change their sites and get fixed in new releases regularly.
