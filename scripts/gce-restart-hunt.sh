#!/bin/bash
set -e
pkill -f 'scripts/hunt.mjs' 2>/dev/null || true
sleep 1
cd /var/www/ghost-museum
export GM_HUNT_DIR=/var/www/ghost-museum/hunt
nohup node scripts/hunt.mjs --loop >> /tmp/ghost-hunt.log 2>&1 &
echo $! > /tmp/ghost-hunt.pid
python3 - <<'PY'
import json
w=json.load(open('/var/www/ghost-museum/hunt/watchlist.json'))
print('watch', len(w.get('watchlist') or []))
PY
