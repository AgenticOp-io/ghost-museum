#!/bin/bash
# Continuous hang:auto drain on ghosts host (does not wait on discover/search).
set -e
pkill -f 'scripts/hang-drain-loop.mjs' 2>/dev/null || true
pkill -f 'scripts/hang-auto.mjs' 2>/dev/null || true
pkill -f 'gce-hang-drain.sh' 2>/dev/null || true
sleep 1
cd /var/www/ghost-museum
export GM_HUNT_DIR=/var/www/ghost-museum/hunt
export GM_HANG_AUTO_MAX="${GM_HANG_AUTO_MAX:-80}"
export GM_HANG_DRAIN_MS="${GM_HANG_DRAIN_MS:-1800000}"
export GM_HANG_CATCHUP_MS="${GM_HANG_CATCHUP_MS:-90000}"
if [ -f /var/www/ghost-museum/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /var/www/ghost-museum/.env
  set +a
fi
nohup node scripts/hang-drain-loop.mjs >> /tmp/ghost-hang-drain.log 2>&1 &
echo $! > /tmp/ghost-hang-drain.pid
echo "hang-drain pid $(cat /tmp/ghost-hang-drain.pid) max=$GM_HANG_AUTO_MAX catchup_ms=$GM_HANG_CATCHUP_MS"
