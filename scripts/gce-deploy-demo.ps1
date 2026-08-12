<#
.SYNOPSIS
  Deploy Ghost Museum demo hall + nominate API to GCE.

.DESCRIPTION
  Copies site/ + demo-server.mjs to agenticop-master and serves with Node
  (static files + POST /api/nominate). Default port 27474.

.EXAMPLE
  powershell -File scripts/gce-deploy-demo.ps1
#>
param(
  [string]$Instance = "agenticop-master",
  [string]$Zone = "us-central1-a",
  [int]$Port = 27474,
  [string]$RemoteDir = "/var/www/ghost-museum"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Site = Join-Path $Root "site"
$Server = Join-Path $Root "scripts\demo-server.mjs"

if (-not (Test-Path (Join-Path $Site "index.html"))) {
  throw "Missing site/index.html under $Root"
}
if (-not (Test-Path $Server)) {
  throw "Missing scripts/demo-server.mjs"
}

Write-Host "Creating remote dir $RemoteDir on $Instance..."
gcloud compute ssh $Instance --zone=$Zone --command="sudo mkdir -p $RemoteDir/site $RemoteDir/scripts $RemoteDir/nominations && sudo chown -R `$USER:`$USER $RemoteDir"

Write-Host "Uploading site/ + demo-server.mjs ..."
gcloud compute scp --recurse --zone=$Zone "$Site\*" "${Instance}:${RemoteDir}/site/"
gcloud compute scp --zone=$Zone $Server "${Instance}:${RemoteDir}/scripts/demo-server.mjs"

$remoteScript = @"
set -e
cd $RemoteDir
if [ -f /tmp/ghost-museum.pid ]; then
  old=`$(cat /tmp/ghost-museum.pid || true)
  if [ -n "`$old" ] && kill -0 `$old 2>/dev/null; then
    kill `$old || true
    sleep 1
  fi
fi
fuser -k ${Port}/tcp 2>/dev/null || true
export GM_SITE_ROOT=$RemoteDir/site
export GM_NOMINATIONS_DIR=$RemoteDir/nominations
export GM_PORT=$Port
nohup node $RemoteDir/scripts/demo-server.mjs > /tmp/ghost-museum.log 2>&1 &
echo `$! > /tmp/ghost-museum.pid
sleep 1
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:$Port/
"@
$remoteScript = $remoteScript -replace "`r`n", "`n"
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))

Write-Host "Starting Node demo server on :$Port ..."
gcloud compute ssh $Instance --zone=$Zone --command="echo $b64 | base64 -d | bash"

$ip = gcloud compute instances describe $Instance --zone=$Zone --format="get(networkInterfaces[0].accessConfigs[0].natIP)"
Write-Host ""
Write-Host "Ghost Museum demo: http://${ip}:$Port/"
Write-Host "Nominate:           http://${ip}:$Port/nominate.html"
