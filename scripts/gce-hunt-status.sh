#!/bin/bash
set -e
echo "=== procs ==="
ps aux | grep -E 'hunt.mjs|demo-server' | grep -v grep || true
echo "=== pids ==="
cat /tmp/ghost-hunt.pid 2>/dev/null || true
cat /tmp/ghost-museum.pid 2>/dev/null || true
echo "=== last-pass ==="
cat /var/www/ghost-museum/hunt/last-pass.json 2>/dev/null || true
echo "=== files ==="
wc -l /var/www/ghost-museum/hunt/findings.jsonl 2>/dev/null || true
ls -la /var/www/ghost-museum/hunt/findings.jsonl /var/www/ghost-museum/hunt/watchlist.json 2>/dev/null || true
echo "=== hunt log tail ==="
tail -n 40 /tmp/ghost-hunt.log 2>/dev/null || true
echo "=== census / hall ==="
curl -fsS http://127.0.0.1:19191/api/census -o /tmp/c.json
curl -fsS 'http://127.0.0.1:19191/api/hall?page=1&pageSize=1' -o /tmp/h.json
python3 - <<'PY'
import json
from datetime import datetime, timezone, timedelta
c=json.load(open('/tmp/c.json'))
h=json.load(open('/tmp/h.json'))
print('census', {k:c.get(k) for k in ['total','hung','verified','verifiedDeep','authorityWatch','deepWatch','watchlist','probeErrors','updatedAt']})
print('hall', {k:h.get(k) for k in ['total','pages','catalogSize']})
# recent findings
cut=(datetime.now(timezone.utc)-timedelta(minutes=15)).isoformat().replace('+00:00','Z')
n=0; last=None; walls={}
with open('/var/www/ghost-museum/hunt/findings.jsonl') as f:
  for line in f:
    try:o=json.loads(line)
    except:continue
    t=o.get('huntedAt') or ''
    if t>=cut:
      n+=1
      w=o.get('suggestedWall') or ('error' if o.get('probeError') else 'none')
      walls[w]=walls.get(w,0)+1
    if not last or t>last: last=t
print('findings_last_15m', n, 'last', last, 'walls', walls)
PY
