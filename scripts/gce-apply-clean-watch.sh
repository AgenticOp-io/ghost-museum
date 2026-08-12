#!/bin/bash
set -e
RemoteDir=/var/www/ghost-museum
sed -i 's/\r$//' "$RemoteDir/scripts/gce-restart-hunt.sh" "$RemoteDir/scripts/gce-restart-museum.sh" 2>/dev/null || true
bash "$RemoteDir/scripts/gce-restart-hunt.sh"
cp "$RemoteDir/scripts/gce-restart-museum.sh" /tmp/
bash /tmp/gce-restart-museum.sh
python3 - <<'PY'
import json
w=json.load(open('/var/www/ghost-museum/hunt/watchlist.json'))
wl=w.get('watchlist') or []
deep=sum(1 for x in wl if str(x.get('source') or '').endswith(('-deep','-vast')))
print('watch', len(wl), 'deep', deep, 'mode', w.get('seedMode'))
PY
