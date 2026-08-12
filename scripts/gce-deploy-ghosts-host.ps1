<#
.SYNOPSIS
  Deploy Ghost Museum to chrysalis-test-vm behind nginx (ghosts.agenticop.io).
#>
param(
  [string]$Instance = "chrysalis-test-vm",
  [string]$Zone = "us-central1-a",
  [int]$Port = 19191,
  [string]$RemoteDir = "/var/www/ghost-museum"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Site = Join-Path $Root "site"
$Server = Join-Path $Root "scripts\demo-server.mjs"
$Hunt = Join-Path $Root "scripts\hunt.mjs"
$Watch = Join-Path $Root "hunt\watchlist.json"
$Install = Join-Path $Root "scripts\gce-install-ghosts-vhost.sh"

Write-Host "Uploading to $Instance ..."
gcloud compute ssh $Instance --zone=$Zone --command="sudo mkdir -p $RemoteDir/site $RemoteDir/scripts $RemoteDir/nominations $RemoteDir/acme $RemoteDir/hunt && sudo chown -R `$USER:`$USER $RemoteDir"

gcloud compute scp --recurse --zone=$Zone "$Site\*" "${Instance}:${RemoteDir}/site/"
gcloud compute scp --zone=$Zone $Server "${Instance}:${RemoteDir}/scripts/demo-server.mjs"
gcloud compute scp --zone=$Zone $Hunt "${Instance}:${RemoteDir}/scripts/hunt.mjs"
gcloud compute scp --zone=$Zone (Join-Path $Root "scripts\lib\census.mjs") "${Instance}:${RemoteDir}/scripts/lib/census.mjs"
gcloud compute scp --zone=$Zone (Join-Path $Root "scripts\lib\hall.mjs") "${Instance}:${RemoteDir}/scripts/lib/hall.mjs"
gcloud compute scp --zone=$Zone (Join-Path $Root "scripts\lib\hang.mjs") "${Instance}:${RemoteDir}/scripts/lib/hang.mjs"
gcloud compute scp --zone=$Zone (Join-Path $Root "scripts\lib\ghost-model.mjs") "${Instance}:${RemoteDir}/scripts/lib/ghost-model.mjs"
gcloud compute scp --zone=$Zone (Join-Path $Root "scripts\lib\probe.mjs") "${Instance}:${RemoteDir}/scripts/lib/probe.mjs"
gcloud compute scp --zone=$Zone (Join-Path $Root "scripts\authority-loop.mjs") "${Instance}:${RemoteDir}/scripts/authority-loop.mjs"
gcloud compute scp --zone=$Zone (Join-Path $Root "scripts\hang-auto.mjs") "${Instance}:${RemoteDir}/scripts/hang-auto.mjs"
gcloud compute scp --zone=$Zone (Join-Path $Root "scripts\hang.mjs") "${Instance}:${RemoteDir}/scripts/hang.mjs"
gcloud compute scp --zone=$Zone (Join-Path $Root "scripts\discover.mjs") "${Instance}:${RemoteDir}/scripts/discover.mjs"
gcloud compute scp --zone=$Zone (Join-Path $Root "scripts\autoseed.mjs") "${Instance}:${RemoteDir}/scripts/autoseed.mjs"
gcloud compute scp --zone=$Zone (Join-Path $Root "scripts\search-seed.mjs") "${Instance}:${RemoteDir}/scripts/search-seed.mjs"
gcloud compute scp --zone=$Zone (Join-Path $Root "scripts\curate.mjs") "${Instance}:${RemoteDir}/scripts/curate.mjs"
gcloud compute scp --zone=$Zone (Join-Path $Root "scripts\seed-watchlist.mjs") "${Instance}:${RemoteDir}/scripts/seed-watchlist.mjs"
gcloud compute scp --zone=$Zone (Join-Path $Root "scripts\validate.mjs") "${Instance}:${RemoteDir}/scripts/validate.mjs"
gcloud compute scp --zone=$Zone (Join-Path $Root "scripts\gce-restart-authority.sh") "${Instance}:${RemoteDir}/scripts/gce-restart-authority.sh"
gcloud compute scp --zone=$Zone (Join-Path $Root "scripts\gce-authority-status.sh") "${Instance}:${RemoteDir}/scripts/gce-authority-status.sh"
gcloud compute scp --zone=$Zone $Watch "${Instance}:${RemoteDir}/hunt/watchlist.json"
gcloud compute scp --recurse --zone=$Zone (Join-Path $Root "hunt\seeds") "${Instance}:${RemoteDir}/hunt/seeds"
gcloud compute scp --zone=$Zone $Install "${Instance}:/tmp/gce-install-ghosts-vhost.sh"

$remote = @"
set -e
sed -i 's/\r$//' /tmp/gce-install-ghosts-vhost.sh
# bind localhost for nginx-only public exposure
export GM_BIND=127.0.0.1
export GM_PORT=$Port
export GM_ROOT=$RemoteDir
# rewrite install to export bind
cd $RemoteDir
if [ -f /tmp/ghost-museum.pid ]; then
  old=`$(cat /tmp/ghost-museum.pid || true)
  if [ -n "`$old" ] && kill -0 `$old 2>/dev/null; then kill `$old || true; sleep 1; fi
fi
fuser -k ${Port}/tcp 2>/dev/null || true
export GM_SITE_ROOT=$RemoteDir/site
export GM_NOMINATIONS_DIR=$RemoteDir/nominations
nohup env GM_BIND=127.0.0.1 GM_PORT=$Port GM_SITE_ROOT=$RemoteDir/site GM_NOMINATIONS_DIR=$RemoteDir/nominations node $RemoteDir/scripts/demo-server.mjs > /tmp/ghost-museum.log 2>&1 &
echo `$! > /tmp/ghost-museum.pid
sleep 1
curl -fsS -o /dev/null http://127.0.0.1:$Port/

CONF_AVAIL=/etc/nginx/sites-available/ghosts-museum
# letsencrypt/live is root-only; plain test -f fails for the SSH user and would drop :443
if sudo test -f /etc/letsencrypt/live/ghosts.agenticop.io/fullchain.pem; then
  sudo tee `$CONF_AVAIL > /dev/null <<'NGX'
server {
    listen 80;
    listen [::]:80;
    server_name ghosts.agenticop.io;
    location ^~ /.well-known/acme-challenge/ { root /var/www/ghost-museum/acme; default_type "text/plain"; }
    location / { return 301 https://`$host`$request_uri; }
}
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ghosts.agenticop.io;
    ssl_certificate     /etc/letsencrypt/live/ghosts.agenticop.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ghosts.agenticop.io/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:19191;
        proxy_http_version 1.1;
        proxy_set_header Host `$host;
        proxy_set_header X-Real-IP `$remote_addr;
        proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto `$scheme;
    }
}
NGX
else
  sudo tee `$CONF_AVAIL > /dev/null <<'NGX'
server {
    listen 80;
    listen [::]:80;
    server_name ghosts.agenticop.io;
    location ^~ /.well-known/acme-challenge/ { root /var/www/ghost-museum/acme; default_type "text/plain"; }
    location / {
        proxy_pass http://127.0.0.1:19191;
        proxy_http_version 1.1;
        proxy_set_header Host `$host;
        proxy_set_header X-Real-IP `$remote_addr;
        proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto `$scheme;
    }
}
NGX
fi
sudo ln -sfn `$CONF_AVAIL /etc/nginx/sites-enabled/ghosts-museum
sudo nginx -t
sudo systemctl reload nginx
curl -fsS -o /dev/null -H 'Host: ghosts.agenticop.io' http://127.0.0.1/ && echo HOST_OK
if sudo test -f /etc/letsencrypt/live/ghosts.agenticop.io/fullchain.pem; then
  curl -fsSk -o /dev/null --resolve ghosts.agenticop.io:443:127.0.0.1 https://ghosts.agenticop.io/ && echo HTTPS_OK
fi
"@
$remote = $remote -replace "`r`n", "`n"
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remote))
gcloud compute ssh $Instance --zone=$Zone --command="echo $b64 | base64 -d | bash"

Write-Host ""
Write-Host "App on $Instance :$Port (localhost). nginx vhost ghosts.agenticop.io ready."
Write-Host "DNS: set GODADDY_API_KEY/SECRET then: powershell -File scripts/godaddy-set-ghosts-dns.ps1"
Write-Host "TLS after DNS: gcloud compute ssh $Instance --zone=$Zone --command=`"sudo certbot certonly --webroot -w $RemoteDir/acme -d ghosts.agenticop.io --agree-tos -m admin@agenticop.io --non-interactive && sudo nginx -t && sudo systemctl reload nginx`""
