param(
  [string]$BaseUrl = "http://localhost:8080",
  [string]$OutputRoot = "artifacts/field-db-rehearsal",
  [switch]$RunDeploy,
  [switch]$RunSeed
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-RecordedCommand {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  $startedAt = (Get-Date).ToUniversalTime().ToString("o")
  $output = ""
  $exitCode = 0
  try {
    $output = (& $Command 2>&1 | Out-String)
    if ($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0) {
      $exitCode = $LASTEXITCODE
    }
  } catch {
    $output = $_ | Out-String
    $exitCode = 1
  }

  return [pscustomobject]@{
    name = $Name
    status = $(if ($exitCode -eq 0) { "PASS" } else { "REVIEW" })
    command = $Name
    startedAt = $startedAt
    finishedAt = (Get-Date).ToUniversalTime().ToString("o")
    exitCode = $exitCode
    output = $output.Trim()
  }
}

function Invoke-CurlJson {
  param([string]$Url)

  $output = & curl.exe -sS -f $Url
  if ($LASTEXITCODE -ne 0) {
    throw "HTTP GET $Url failed with exit code $LASTEXITCODE"
  }
  return ($output | ConvertFrom-Json)
}

function Assert-NumberProperty {
  param(
    [object]$Object,
    [string]$Name,
    [string]$Label
  )

  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property -or $null -eq $property.Value) {
    throw "$Label did not include $Name."
  }
  if ($property.Value -is [bool] -or $property.Value -isnot [System.ValueType]) {
    throw "$Label expected $Name to be numeric."
  }
}

$runId = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$outputDir = Join-Path $OutputRoot $runId
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$results = @()
if ($RunDeploy) {
  $results += Invoke-RecordedCommand -Name "npm run db:deploy" -Command { npm.cmd run db:deploy }
}
if ($RunSeed) {
  $results += Invoke-RecordedCommand -Name "npm run db:seed" -Command { npm.cmd run db:seed }
}
$results += Invoke-RecordedCommand -Name "npm run db:status" -Command { npm.cmd run db:status }

$databaseHealth = Invoke-CurlJson -Url "$BaseUrl/api/database/health"
if (!$databaseHealth.ok -or $databaseHealth.database -ne "postgresql" -or !$databaseHealth.tables) {
  throw "Database health endpoint did not report PostgreSQL table health."
}
@("users", "sites", "zones", "devices", "vehicleTracks", "trafficEvents", "controlCommands", "deviceStatusLogs") |
  ForEach-Object { Assert-NumberProperty -Object $databaseHealth.tables -Name $_ -Label "Database health tables" }

$systemStatus = Invoke-CurlJson -Url "$BaseUrl/api/status"
if (!$systemStatus.ok -or !$systemStatus.database -or !$systemStatus.devices -or !$systemStatus.controlBoard) {
  throw "System status endpoint did not include database, devices, and controlBoard sections."
}

$deviceStatus = Invoke-CurlJson -Url "$BaseUrl/api/devices/status"
if (!$deviceStatus.ok -or $null -eq $deviceStatus.PSObject.Properties["total"]) {
  throw "Device status endpoint did not include device totals."
}

$sites = Invoke-CurlJson -Url "$BaseUrl/api/sites"
if (!$sites.items -or $sites.items.Count -lt 1) {
  throw "Sites endpoint did not return any configured site."
}
$zones = Invoke-CurlJson -Url "$BaseUrl/api/zones"
if (!$zones.items -or $zones.items.Count -lt 1) {
  throw "Zones endpoint did not return any configured zone."
}
$devices = Invoke-CurlJson -Url "$BaseUrl/api/devices"
if (!$devices.items -or $devices.items.Count -lt 1) {
  throw "Devices endpoint did not return any configured device."
}

$results += [pscustomobject]@{
  name = "database health api"
  status = "PASS"
  response = $databaseHealth
}
$results += [pscustomobject]@{
  name = "system and configured device api"
  status = "PASS"
  response = @{
    systemStatus = $systemStatus
    deviceStatus = $deviceStatus
    sites = $sites.total
    zones = $zones.total
    devices = $devices.total
  }
}

$manifest = [pscustomobject]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  baseUrl = $BaseUrl
  runDeploy = [bool]$RunDeploy
  runSeed = [bool]$RunSeed
  results = $results
  databaseHealth = $databaseHealth
}

$manifest | ConvertTo-Json -Depth 20 | Out-File -LiteralPath (Join-Path $outputDir "manifest.json") -Encoding utf8
$markdownLines = @(
  "# DB Prisma Field Rehearsal",
  "",
  "- Generated at: $($manifest.generatedAt)",
  "- Base URL: $BaseUrl",
  "- Run deploy: $($manifest.runDeploy)",
  "- Run seed: $($manifest.runSeed)",
  "",
  "## Results",
  "",
  "| Status | Check |",
  "| --- | --- |"
) + ($results | ForEach-Object { "| $($_.status) | $($_.name) |" }) + @(
  "",
  "## Database Tables",
  "",
  '```json',
  ($databaseHealth.tables | ConvertTo-Json -Depth 10),
  '```',
  ""
)
$markdownLines | Out-File -LiteralPath (Join-Path $outputDir "manifest.md") -Encoding utf8

if (($results | Where-Object { $_.status -ne "PASS" }).Count -gt 0) {
  throw "DB Prisma field rehearsal completed with REVIEW items."
}

Write-Host "db prisma field rehearsal ok"
Write-Host "evidence written to $outputDir"
