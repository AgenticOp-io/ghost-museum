#!/bin/bash
set -e
pkill -f 'scripts/hunt.mjs' 2>/dev/null || true
sleep 1
cd /var/www/ghost-museum
export GM_HUNT_DIR=/var/www/ghost-museum/hunt
export GM_HUNT_PASS_MAX="${GM_HUNT_PASS_MAX:-60}"
export GM_HUNT_PASS_PAUSE_MS="${GM_HUNT_PASS_PAUSE_MS:-20000}"
export GM_HUNT_TIMEOUT_MS="${GM_HUNT_TIMEOUT_MS:-12000}"
export GM_HUNT_REQUERY_UNPROBED_MS="${GM_HUNT_REQUERY_UNPROBED_MS:-10800000}"
if [ -f /var/www/ghost-museum/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /var/www/ghost-museum/.env
  set +a
fi
# Warm findings index once so the first pass does not stall on a 10MB jsonl scan.
node scripts/hunt.mjs --rebuild-index || true
nohup node scripts/hunt.mjs --loop >> /tmp/ghost-hunt.log 2>&1 &
echo $! > /tmp/ghost-hunt.pid
echo "hunt pid $(cat /tmp/ghost-hunt.pid) passMax=$GM_HUNT_PASS_MAX"
python3 - <<'PY'
import json
w=json.load(open('/var/www/ghost-museum/hunt/watchlist.json'))
print('watch', len(w.get('watchlist') or []))
PY
