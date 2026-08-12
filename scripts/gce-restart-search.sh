#!/bin/bash
# Restart SerpAPI search schedule on ghosts host (≤25 searches / month).
set -e
pkill -f 'scripts/search-schedule-loop.mjs' 2>/dev/null || true
sleep 1
cd /var/www/ghost-museum
export GM_HUNT_DIR=/var/www/ghost-museum/hunt
export SERPAPI_MONTHLY_BUDGET="${SERPAPI_MONTHLY_BUDGET:-25}"
export GM_SEARCH_PERIOD_MS="${GM_SEARCH_PERIOD_MS:-111600000}"
export GM_SEARCH_QUERIES_PER_RUN="${GM_SEARCH_QUERIES_PER_RUN:-1}"
if [ -f /var/www/ghost-museum/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /var/www/ghost-museum/.env
  set +a
fi
if [ -z "${SERPAPI_API_KEY:-}" ]; then
  echo "SERPAPI_API_KEY not set — search schedule not started"
  exit 0
fi
nohup node scripts/search-schedule-loop.mjs >> /tmp/ghost-search.log 2>&1 &
echo $! > /tmp/ghost-search.pid
echo "search-schedule pid $(cat /tmp/ghost-search.pid) period_ms=$GM_SEARCH_PERIOD_MS budget=$SERPAPI_MONTHLY_BUDGET queries=$GM_SEARCH_QUERIES_PER_RUN"
