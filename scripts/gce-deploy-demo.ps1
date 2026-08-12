<#
.SYNOPSIS
  Deploy Ghost Museum demo hall + nominate/hunt APIs to GCE.

.DESCRIPTION
  Copies site/, hunt/, and demo-server.mjs to agenticop-master (:27474).
#>
param(
  [string]$Instance = "agenticop-master",
  [string]$Zone = "us-central1-a",
  [int]$Port = 27474,
  [string]$RemoteDir = "/var/www/ghost-museum",
  [string]$FindingsSourceInstance = "chrysalis-test-vm"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Site = Join-Path $Root "site"
$Hunt = Join-Path $Root "hunt"
$Server = Join-Path $Root "scripts\demo-server.mjs"
$HuntJs = Join-Path $Root "scripts\hunt.mjs"

Write-Host "Creating remote dir $RemoteDir on $Instance..."
gcloud compute ssh $Instance --zone=$Zone --command="sudo mkdir -p $RemoteDir/site $RemoteDir/scripts $RemoteDir/nominations $RemoteDir/hunt && sudo chown -R `$USER:`$USER $RemoteDir"

Write-Host "Uploading site/ hunt/ scripts ..."
gcloud compute scp --recurse --zone=$Zone "$Site\*" "${Instance}:${RemoteDir}/site/"
gcloud compute scp --recurse --zone=$Zone "$Hunt\*" "${Instance}:${RemoteDir}/hunt/"
gcloud compute scp --zone=$Zone $Server "${Instance}:${RemoteDir}/scripts/demo-server.mjs"
gcloud compute scp --zone=$Zone $HuntJs "${Instance}:${RemoteDir}/scripts/hunt.mjs"

# Pull live findings from the hunt host if present
Write-Host "Syncing findings from $FindingsSourceInstance (if any)..."
gcloud compute ssh $FindingsSourceInstance --zone=$Zone --command="test -f /var/www/ghost-museum/hunt/findings.jsonl && cat /var/www/ghost-museum/hunt/findings.jsonl || true" | Out-File -Encoding utf8 "$env:TEMP\gm-findings.jsonl"
if ((Get-Item "$env:TEMP\gm-findings.jsonl").Length -gt 0) {
  gcloud compute scp --zone=$Zone "$env:TEMP\gm-findings.jsonl" "${Instance}:${RemoteDir}/hunt/findings.jsonl"
}

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
export GM_HUNT_DIR=$RemoteDir/hunt
export GM_PORT=$Port
nohup node $RemoteDir/scripts/demo-server.mjs > /tmp/ghost-museum.log 2>&1 &
echo `$! > /tmp/ghost-museum.pid
sleep 1
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:$Port/
curl -fsS -o /dev/null -w 'hunt:%{http_code}\n' http://127.0.0.1:$Port/api/hunt/findings
"@
$remoteScript = $remoteScript -replace "`r`n", "`n"
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))

Write-Host "Starting Node demo server on :$Port ..."
gcloud compute ssh $Instance --zone=$Zone --command="echo $b64 | base64 -d | bash"

$ip = gcloud compute instances describe $Instance --zone=$Zone --format="get(networkInterfaces[0].accessConfigs[0].natIP)"
Write-Host ""
Write-Host "Ghost Museum demo: http://${ip}:$Port/"
Write-Host "Hunt desk:          http://${ip}:$Port/hunt.html"
Write-Host "Nominate:           http://${ip}:$Port/nominate.html"
