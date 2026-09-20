#!/bin/sh
set -e

cd /opt/bgutil-ytdlp-pot-provider/server/node_modules

deno run \
  --allow-env \
  --allow-net \
  --allow-ffi=. \
  --allow-read=. \
  ../src/main.ts \
  --host 127.0.0.1 \
  --port 4416 &

POT_PID=$!

for i in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:4416/ping >/dev/null 2>&1; then
        echo "BGUTIL POT SERVER: READY"
        break
    fi
    sleep 1
done

cd /app

exec uvicorn main:app --host 0.0.0.0 --port 8080
