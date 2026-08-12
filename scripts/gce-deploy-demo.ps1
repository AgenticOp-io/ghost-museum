<#
.SYNOPSIS
  Deploy Ghost Museum static hall to GCE on a demo port.

.DESCRIPTION
  Copies site/ to agenticop-master and serves with python3 http.server.
  Default port 27474 — already allowed by firewall rule allow-pbb-opelika-27474
  (target tag http-server). Preferred dedicated port is 19191 once a project
  admin creates allow-ghost-museum (this SA lacks compute.firewalls.create).

  Does not touch :80/:443, hub :19090, or Helix :18085.

.EXAMPLE
  powershell -File scripts/gce-deploy-demo.ps1
  powershell -File scripts/gce-deploy-demo.ps1 -Port 19191
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

if (-not (Test-Path (Join-Path $Site "index.html"))) {
  throw "Missing site/index.html under $Root"
}

Write-Host "Creating remote dir $RemoteDir on $Instance..."
gcloud compute ssh $Instance --zone=$Zone --command="sudo mkdir -p $RemoteDir && sudo chown -R `$USER:`$USER $RemoteDir"

Write-Host "Uploading site/ ..."
gcloud compute scp --recurse --zone=$Zone "$Site\*" "${Instance}:${RemoteDir}/"

# LF-only remote script (PowerShell here-strings can inject CRLF and break bash).
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
# free the port if a stray server holds it
fuser -k ${Port}/tcp 2>/dev/null || true
nohup python3 -m http.server $Port --bind 0.0.0.0 > /tmp/ghost-museum.log 2>&1 &
echo `$! > /tmp/ghost-museum.pid
sleep 1
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:$Port/
"@
$remoteScript = $remoteScript -replace "`r`n", "`n"
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))

Write-Host "Starting python3 http.server on :$Port ..."
gcloud compute ssh $Instance --zone=$Zone --command="echo $b64 | base64 -d | bash"

$ip = gcloud compute instances describe $Instance --zone=$Zone --format="get(networkInterfaces[0].accessConfigs[0].natIP)"
Write-Host ""
Write-Host "Ghost Museum demo: http://${ip}:$Port/"
