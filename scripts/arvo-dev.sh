#!/usr/bin/env sh
set -eu

lock_file=".next/dev/lock"
log_file=".next/dev/logs/next-development.log"

if [ -f "$lock_file" ]; then
  pid="$(node -e 'const fs = require("fs"); try { const lock = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); if (lock.pid) process.stdout.write(String(lock.pid)); } catch {}' "$lock_file")"
  app_url="$(node -e 'const fs = require("fs"); try { const lock = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); if (lock.appUrl) process.stdout.write(lock.appUrl); } catch {}' "$lock_file")"

  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    if [ -n "$app_url" ]; then
      echo "StackHatch is already running on $app_url (PID $pid)."
    else
      echo "StackHatch is already running (PID $pid)."
    fi

    if [ -f "$log_file" ]; then
      echo "Following $log_file"
      exec tail -n 40 -f "$log_file"
    fi

    exit 0
  fi
fi

port=3000
while ss -H -ltn "sport = :$port" | grep -q .; do
  port=$((port + 1))
done

echo "Starting StackHatch on http://localhost:$port"
exec npm run dev -- --port "$port"
