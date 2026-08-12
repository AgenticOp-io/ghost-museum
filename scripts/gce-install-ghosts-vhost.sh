#!/usr/bin/env bash
# Install Ghost Museum behind nginx on chrysalis-test-vm as ghosts.agenticop.io
# Run on the VM (or via gcloud compute ssh … --command).
set -euo pipefail

ROOT="${GM_ROOT:-/var/www/ghost-museum}"
PORT="${GM_PORT:-19191}"
SITE_SRC="${1:-}"

sudo mkdir -p "$ROOT/site" "$ROOT/scripts" "$ROOT/nominations" "$ROOT/acme" "$ROOT/hunt"
sudo chown -R "$USER:$USER" "$ROOT"

if [[ -n "$SITE_SRC" && -d "$SITE_SRC" ]]; then
  rsync -a --delete "$SITE_SRC/site/" "$ROOT/site/"
  cp -f "$SITE_SRC/scripts/demo-server.mjs" "$ROOT/scripts/demo-server.mjs"
  [[ -f "$SITE_SRC/scripts/hunt.mjs" ]] && cp -f "$SITE_SRC/scripts/hunt.mjs" "$ROOT/scripts/hunt.mjs"
fi

# Stop prior
if [[ -f /tmp/ghost-museum.pid ]]; then
  old=$(cat /tmp/ghost-museum.pid || true)
  if [[ -n "${old:-}" ]] && kill -0 "$old" 2>/dev/null; then
    kill "$old" || true
    sleep 1
  fi
fi
fuser -k "${PORT}/tcp" 2>/dev/null || true

export GM_SITE_ROOT="$ROOT/site"
export GM_NOMINATIONS_DIR="$ROOT/nominations"
export GM_PORT="$PORT"
# Bind localhost only — nginx terminates TLS
nohup node "$ROOT/scripts/demo-server.mjs" > /tmp/ghost-museum.log 2>&1 &
echo $! > /tmp/ghost-museum.pid
# Patch server bind: demo-server listens 0.0.0.0; firewall still ok via nginx only.
sleep 1
curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/"

# nginx site (HTTP-only first if no cert yet)
CONF_AVAIL=/etc/nginx/sites-available/ghosts-museum
CONF_ENABLED=/etc/nginx/sites-enabled/ghosts-museum

if [[ -f /etc/letsencrypt/live/ghosts.agenticop.io/fullchain.pem ]]; then
  sudo tee "$CONF_AVAIL" > /dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ghosts.agenticop.io;
    location ^~ /.well-known/acme-challenge/ {
        root $ROOT/acme;
        default_type "text/plain";
    }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ghosts.agenticop.io;
    ssl_certificate     /etc/letsencrypt/live/ghosts.agenticop.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ghosts.agenticop.io/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
else
  sudo tee "$CONF_AVAIL" > /dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ghosts.agenticop.io;
    location ^~ /.well-known/acme-challenge/ {
        root $ROOT/acme;
        default_type "text/plain";
    }
    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
fi

sudo ln -sfn "$CONF_AVAIL" "$CONF_ENABLED"
sudo nginx -t
sudo systemctl reload nginx
echo "OK http://ghosts.agenticop.io/ (via this host) → 127.0.0.1:${PORT}"
