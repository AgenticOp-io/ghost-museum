#!/bin/bash
set -e
pkill -f 'scripts/process-watchdog.mjs' 2>/dev/null || true
sleep 1
cd /var/www/ghost-museum
export GM_WATCHDOG_MS="${GM_WATCHDOG_MS:-60000}"
if [ -f /var/www/ghost-museum/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /var/www/ghost-museum/.env
  set +a
fi
nohup node scripts/process-watchdog.mjs >> /tmp/ghost-watchdog.log 2>&1 &
echo $! > /tmp/ghost-watchdog.pid
echo "watchdog pid $(cat /tmp/ghost-watchdog.pid)"
