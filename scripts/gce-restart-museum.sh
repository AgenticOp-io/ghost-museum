#!/bin/bash
set -e
pid=$(cat /tmp/ghost-museum.pid 2>/dev/null || true)
if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
  kill "$pid" || true
  sleep 1
fi
pkill -f 'scripts/demo-server.mjs' 2>/dev/null || true
sleep 1
cd /var/www/ghost-museum
export GM_BIND=127.0.0.1
export GM_PORT=19191
export GM_ROOT=/var/www/ghost-museum
export GM_HUNT_DIR=/var/www/ghost-museum/hunt
nohup node scripts/demo-server.mjs >> /tmp/ghost-museum.log 2>&1 &
echo $! > /tmp/ghost-museum.pid
sleep 1
bash /tmp/gce-check-census.sh
