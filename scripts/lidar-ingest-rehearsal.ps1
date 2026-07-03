param(
  [string]$BaseUrl = "http://localhost:8080",
  [string]$DeviceKey = "",
  [string]$OutputRoot = "artifacts/field-lidar-rehearsal"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-DotEnv {
  param([string]$Path)

  $values = @{}
  if (!(Test-Path $Path)) { return $values }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (!$line -or $line.StartsWith("#")) { return }
    $index = $line.IndexOf("=")
    if ($index -lt 0) { return }
    $values[$line.Substring(0, $index)] = $line.Substring($index + 1)
  }

  return $values
}

function Invoke-CurlJson {
  param(
    [string]$Method = "GET",
    [string]$Url,
    [object]$Body = $null,
    [string]$DeviceKey = ""
  )

  $curlArgs = @("-sS", "-f", "-X", $Method)
  if ($DeviceKey) {
    $curlArgs += @("-H", "X-Device-Key: $DeviceKey")
  }
  if ($null -ne $Body) {
    $json = $Body | ConvertTo-Json -Depth 12 -Compress
    $curlArgs += @("-H", "Content-Type: application/json", "-d", $json)
  }
  $curlArgs += $Url

  $output = & curl.exe @curlArgs
  if ($LASTEXITCODE -ne 0) {
    throw "HTTP $Method $Url failed with exit code $LASTEXITCODE"
  }
  if (!$output) { return $null }
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

function Add-Result {
  param(
    [array]$Results,
    [string]$Name,
    [string]$Status,
    [object]$Response
  )

  return $Results + [pscustomobject]@{
    name = $Name
    status = $Status
    response = $Response
  }
}

function Assert-ControlCommandType {
  param(
    [object]$Command,
    [string]$Expected,
    [string]$Label
  )

  if (!$Command) {
    throw "$Label did not include a control command."
  }
  if ($Command.commandType -ne $Expected) {
    throw "$Label expected control command $Expected but got $($Command.commandType)."
  }
}

function Assert-EventDetailCommandType {
  param(
    [object]$Detail,
    [string]$Expected,
    [string]$Label
  )

  $commands = @($Detail.event.controlCommands | Where-Object { $_.commandType -eq $Expected })
  if ($commands.Count -lt 1) {
    throw "$Label did not expose linked $Expected control command."
  }
  if (!$commands[0].packetHex) {
    throw "$Label linked $Expected control command did not expose packetHex."
  }
}

$envValues = Read-DotEnv ".env"
if (!$DeviceKey) {
  $DeviceKey = $env:DEVICE_INGEST_API_KEY
}
if (!$DeviceKey -and $envValues.ContainsKey("DEVICE_INGEST_API_KEY")) {
  $DeviceKey = $envValues["DEVICE_INGEST_API_KEY"]
}
if ($DeviceKey -and $DeviceKey.Contains(",")) {
  $DeviceKey = $DeviceKey.Split(",")[0].Trim()
}

$timestamp = (Get-Date).ToUniversalTime()
$timestampPrefix = $timestamp.ToString("yyyy-MM-ddTHH:mm:ss")
$runId = $timestamp.ToString("yyyyMMdd-HHmmss")
$outputDir = Join-Path $OutputRoot $runId
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$normalTrackId = "field-normal-$([guid]::NewGuid().ToString('N'))"
$wrongTrackId = "field-wrong-$([guid]::NewGuid().ToString('N'))"
$results = @()

$normalFirst = Invoke-CurlJson -Method "POST" -Url "$BaseUrl/api/wrongway" -DeviceKey $DeviceKey -Body @{
  type = "normal-driving"
  zone_id = "ROUNDABOUT-01"
  track_id = $normalTrackId
  timestamp = "${timestampPrefix}Z"
  normal_moving_vehicle_count = 1
}
if (!$normalFirst.ok -or !$normalFirst.vehicleTrackCreated) {
  throw "First normal-driving payload did not create a unique vehicle track."
}
$results = Add-Result -Results $results -Name "normal-driving first unique track" -Status "PASS" -Response $normalFirst

$normalDuplicate = Invoke-CurlJson -Method "POST" -Url "$BaseUrl/api/wrongway" -DeviceKey $DeviceKey -Body @{
  type = "normal-driving"
  zone_id = "ROUNDABOUT-01"
  track_id = $normalTrackId
  timestamp = "${timestampPrefix}Z"
  normal_moving_vehicle_count = 2
}
if (!$normalDuplicate.ok -or $normalDuplicate.vehicleTrackCreated) {
  throw "Repeated normal-driving payload created a duplicate vehicle track."
}
$results = Add-Result -Results $results -Name "normal-driving duplicate track update" -Status "PASS" -Response $normalDuplicate

$stage1 = Invoke-CurlJson -Method "POST" -Url "$BaseUrl/api/wrongway" -DeviceKey $DeviceKey -Body @{
  type = "wrong-way-level-1"
  zone_id = "ROUNDABOUT-01"
  track_id = $wrongTrackId
  timestamp = "${timestampPrefix}Z"
  warning_level = 1
  confidence = 0.95
  description = "Field rehearsal wrong-way stage 1"
}
if (!$stage1.ok -or !$stage1.eventId -or !$stage1.controlCommand) {
  throw "wrong-way-level-1 payload did not create an event and control command."
}
Assert-ControlCommandType -Command $stage1.controlCommand -Expected "STAGE_1_ON" -Label "wrong-way-level-1 payload"
$results = Add-Result -Results $results -Name "wrong-way-level-1 event and command" -Status "PASS" -Response $stage1

$stage1Duplicate = Invoke-CurlJson -Method "POST" -Url "$BaseUrl/api/wrongway" -DeviceKey $DeviceKey -Body @{
  type = "wrong-way-level-1"
  zone_id = "ROUNDABOUT-01"
  track_id = $wrongTrackId
  timestamp = "${timestampPrefix}Z"
  warning_level = 1
  confidence = 0.96
  description = "Field rehearsal duplicate wrong-way stage 1"
}
if (!$stage1Duplicate.ok -or !$stage1Duplicate.eventReused -or $stage1Duplicate.eventId -ne $stage1.eventId) {
  throw "Repeated wrong-way-level-1 payload did not reuse the active event."
}
$results = Add-Result -Results $results -Name "wrong-way-level-1 duplicate event reuse" -Status "PASS" -Response $stage1Duplicate

$stage2 = Invoke-CurlJson -Method "POST" -Url "$BaseUrl/api/wrongway" -DeviceKey $DeviceKey -Body @{
  type = "wrong-way-level-2"
  zone_id = "ROUNDABOUT-01"
  track_id = $wrongTrackId
  timestamp = "${timestampPrefix}Z"
  warning_level = 2
  confidence = 0.97
  description = "Field rehearsal wrong-way stage 2"
}
if (!$stage2.ok -or !$stage2.eventId -or !$stage2.controlCommand) {
  throw "wrong-way-level-2 payload did not create or update an event and control command."
}
Assert-ControlCommandType -Command $stage2.controlCommand -Expected "STAGE_2_ON" -Label "wrong-way-level-2 payload"
$results = Add-Result -Results $results -Name "wrong-way-level-2 event and command" -Status "PASS" -Response $stage2

$ended = Invoke-CurlJson -Method "POST" -Url "$BaseUrl/api/wrongway" -DeviceKey $DeviceKey -Body @{
  type = "situation-ended"
  zone_id = "ROUNDABOUT-01"
  track_id = $wrongTrackId
  timestamp = "${timestampPrefix}Z"
  warning_level = 0
  description = "Field rehearsal situation ended"
}
if (!$ended.ok -or !$ended.resolvedEventIds -or $ended.resolvedEventIds.Count -lt 1) {
  throw "situation-ended payload did not resolve an active wrong-way event."
}
Assert-ControlCommandType -Command $ended.controlCommand -Expected "STAGE_2_RETURN" -Label "situation-ended payload"
$results = Add-Result -Results $results -Name "situation-ended resolves active events" -Status "PASS" -Response $ended

foreach ($eventSpec in @(
  @{ eventId = $stage1.eventId; commandType = "STAGE_1_ON"; label = "Stage 1 event detail" },
  @{ eventId = $stage2.eventId; commandType = "STAGE_2_ON"; label = "Stage 2 event detail" }
)) {
  $eventId = $eventSpec.eventId
  $detail = Invoke-CurlJson -Url "$BaseUrl/api/events/$eventId"
  if (!$detail.ok -or !$detail.event -or !$detail.event.rawPayload) {
    throw "Event detail $eventId did not expose rawPayload."
  }
  if (!$detail.event.controlCommands -or $detail.event.controlCommands.Count -lt 1) {
    throw "Event detail $eventId did not expose linked controlCommands."
  }
  Assert-EventDetailCommandType -Detail $detail -Expected $eventSpec.commandType -Label $eventSpec.label
}

$summary = Invoke-CurlJson -Url "$BaseUrl/api/events/summary"
Assert-NumberProperty -Object $summary -Name "vehiclesPassed" -Label "Event summary"
Assert-NumberProperty -Object $summary -Name "wrongwayVehicles" -Label "Event summary"
Assert-NumberProperty -Object $summary -Name "wrongWayEvents" -Label "Event summary"
Assert-NumberProperty -Object $summary -Name "wrongwayRate" -Label "Event summary"

$manifest = [pscustomobject]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  baseUrl = $BaseUrl
  deviceKeyUsed = [bool]$DeviceKey
  normalTrackId = $normalTrackId
  wrongTrackId = $wrongTrackId
  results = $results
  summary = $summary
}

$manifestJson = $manifest | ConvertTo-Json -Depth 20
$manifestJson | Out-File -LiteralPath (Join-Path $outputDir "manifest.json") -Encoding utf8
$markdownLines = @(
  "# Lidar Ingest Field Rehearsal",
  "",
  "- Generated at: $($manifest.generatedAt)",
  "- Base URL: $BaseUrl",
  "- Device key used: $($manifest.deviceKeyUsed)",
  "- Normal track ID: $normalTrackId",
  "- Wrong-way track ID: $wrongTrackId",
  "",
  "## Results",
  "",
  "| Status | Check |",
  "| --- | --- |"
) + ($results | ForEach-Object { "| $($_.status) | $($_.name) |" }) + @(
  "",
  "## Summary",
  "",
  '```json',
  ($summary | ConvertTo-Json -Depth 10),
  '```',
  ""
)
$markdownLines | Out-File -LiteralPath (Join-Path $outputDir "manifest.md") -Encoding utf8

Write-Host "lidar ingest field rehearsal ok"
Write-Host "evidence written to $outputDir"
