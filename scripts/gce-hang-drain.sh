#!/bin/bash
# One-shot hang drain + desk refresh on ghosts host
set -e
cd /var/www/ghost-museum
export GM_HUNT_DIR=/var/www/ghost-museum/hunt
export GM_HANG_AUTO_MAX="${GM_HANG_AUTO_MAX:-80}"
if [ -f .env ]; then set -a; . ./.env; set +a; fi
node scripts/hang-auto.mjs --max "$GM_HANG_AUTO_MAX"
node scripts/validate.mjs
python3 - <<'PY'
import json
ex=json.load(open('exhibits/exhibits.json'))['exhibits']
c=json.load(open('site/curate.json'))
print('hung', len(ex), 'desk', len(c.get('queue') or []), 'strong', (c.get('byDecision') or {}).get('strong'))
PY
