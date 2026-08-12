#!/bin/bash
set -e
Remote=/var/www/ghost-museum
pkill -f 'scripts/authority-loop.mjs' 2>/dev/null || true
sleep 1
python3 - <<'PY'
import json
w=json.load(open('/var/www/ghost-museum/hunt/watchlist.json'))
wl=w.get('watchlist') or []
deep=sum(1 for x in wl if str(x.get('source') or '').endswith(('-deep','-vast')))
print('watch', len(wl), 'deep', deep, 'mode', w.get('seedMode'))
PY
sed -i 's/\r$//' "$Remote/scripts/gce-restart-authority.sh" "$Remote/scripts/gce-restart-hunt.sh" "$Remote/scripts/gce-restart-museum.sh"
bash "$Remote/scripts/gce-restart-authority.sh"
bash "$Remote/scripts/gce-restart-hunt.sh"
cp "$Remote/scripts/gce-restart-museum.sh" /tmp/
bash /tmp/gce-restart-museum.sh
