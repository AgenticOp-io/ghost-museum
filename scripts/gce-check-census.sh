#!/bin/bash
curl -fsS http://127.0.0.1:19191/api/census -o /tmp/c.json
curl -fsS 'http://127.0.0.1:19191/api/hall?page=1&pageSize=24' -o /tmp/h.json
python3 - <<'PY'
import json
c=json.load(open('/tmp/c.json'))
h=json.load(open('/tmp/h.json'))
print('total', c.get('total'))
print('contacted', c.get('contacted'), 'contactedDeep', c.get('contactedDeep'))
print('verified', c.get('verified'), 'watch', c.get('watchlist'))
print('hall_total', h.get('total'), 'pages', h.get('pages'), 'pageSize', h.get('pageSize'))
print('note', c.get('note'))
PY
