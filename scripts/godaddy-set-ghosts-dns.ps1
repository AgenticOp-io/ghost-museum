<#
.SYNOPSIS
  Create/update GoDaddy A record for ghosts.agenticop.io → chrysalis-test-vm.

.DESCRIPTION
  Requires env GODADDY_API_KEY and GODADDY_API_SECRET (developer keys from
  https://developer.godaddy.com/). Does not print secrets.

.EXAMPLE
  $env:GODADDY_API_KEY='…'; $env:GODADDY_API_SECRET='…'
  powershell -File scripts/godaddy-set-ghosts-dns.ps1
#>
param(
  [string]$Domain = "agenticop.io",
  [string]$Name = "ghosts",
  [string]$Ip = "34.61.255.147",
  [int]$Ttl = 600
)

$ErrorActionPreference = "Stop"
$key = $env:GODADDY_API_KEY
$secret = $env:GODADDY_API_SECRET
if (-not $key -or -not $secret) {
  throw "Set GODADDY_API_KEY and GODADDY_API_SECRET (GoDaddy Developer API). Browser login alone is not enough for this script."
}

$headers = @{
  Authorization = "sso-key ${key}:${secret}"
  Accept        = "application/json"
  "Content-Type" = "application/json"
}
$body = ConvertTo-Json @(@{ data = $Ip; ttl = $Ttl })
$url = "https://api.godaddy.com/v1/domains/$Domain/records/A/$Name"

Write-Host "PUT A $Name.$Domain -> $Ip (ttl $Ttl)"
Invoke-RestMethod -Method Put -Uri $url -Headers $headers -Body $body | Out-Null
Write-Host "OK. Check: nslookup $Name.$Domain"
