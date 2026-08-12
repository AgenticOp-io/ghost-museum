#!/bin/bash
# Status for museum + hunt + authority daemons
set -e
echo "=== pids ==="
for f in /tmp/ghost-museum.pid /tmp/ghost-hunt.pid /tmp/ghost-authority.pid; do
  if [ -f "$f" ]; then
    pid=$(cat "$f")
    if kill -0 "$pid" 2>/dev/null; then
      echo "$f → $pid running"
    else
      echo "$f → $pid dead"
    fi
  else
    echo "$f → missing"
  fi
done
echo "=== authority-last ==="
python3 - <<'PY'
import json, os
p='/var/www/ghost-museum/hunt/authority-last.json'
if os.path.exists(p):
  d=json.load(open(p))
  print({k:d.get(k) for k in ['started','finished','ok','hangMax']})
  for s in d.get('steps') or []:
    print(' ', s.get('name'), 'ok' if s.get('ok') else 'FAIL')
else:
  print('no authority-last.json yet')
PY
echo "=== census ==="
bash /tmp/gce-check-census.sh 2>/dev/null || curl -fsS http://127.0.0.1:19191/api/census | python3 -c "import sys,json; c=json.load(sys.stdin); print({k:c.get(k) for k in ['total','hung','verified','contacted','watchlist']})"
