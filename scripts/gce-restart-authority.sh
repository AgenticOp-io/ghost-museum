#!/bin/bash
# Restart Still Answering authority growth daemon on ghosts host.
set -e
pkill -f 'scripts/authority-loop.mjs' 2>/dev/null || true
sleep 1
cd /var/www/ghost-museum
export GM_HUNT_DIR=/var/www/ghost-museum/hunt
export GM_AUTHORITY_PERIOD_MS="${GM_AUTHORITY_PERIOD_MS:-21600000}"
export GM_HANG_AUTO_MAX="${GM_HANG_AUTO_MAX:-25}"
# Optional search keys from /var/www/ghost-museum/.env if present
if [ -f /var/www/ghost-museum/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /var/www/ghost-museum/.env
  set +a
fi
nohup node scripts/authority-loop.mjs --loop >> /tmp/ghost-authority.log 2>&1 &
echo $! > /tmp/ghost-authority.pid
echo "authority pid $(cat /tmp/ghost-authority.pid) period_ms=$GM_AUTHORITY_PERIOD_MS hang_max=$GM_HANG_AUTO_MAX"
tail -n 5 /tmp/ghost-authority.log 2>/dev/null || true
