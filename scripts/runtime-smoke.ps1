param(
  [string]$BaseUrl = "http://localhost:8080",
  [switch]$StartCompose,
  [switch]$StopCompose,
  [int]$ReadyTimeoutSeconds = 90
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
    $key = $line.Substring(0, $index)
    $value = $line.Substring($index + 1)
    $values[$key] = $value
  }

  return $values
}

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  Write-Host "==> $Name"
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

function Invoke-CurlJson {
  param(
    [string]$Method = "GET",
    [string]$Url,
    [object]$Body = $null,
    [string]$BearerToken = "",
    [string]$DeviceKey = ""
  )

  $curlArgs = @("-sS", "-f", "-X", $Method)
  if ($BearerToken) {
    $curlArgs += @("-H", "Authorization: Bearer $BearerToken")
  }
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

function Wait-HttpReady {
  param([string]$Url)

  $deadline = (Get-Date).AddSeconds($ReadyTimeoutSeconds)
  do {
    try {
      Invoke-CurlJson -Url $Url | Out-Null
      return
    } catch {
      Start-Sleep -Seconds 2
    }
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for $Url"
}

if ($StartCompose) {
  Invoke-Step "docker compose up" { docker compose up --build -d }
}

try {
  Wait-HttpReady "$BaseUrl/healthz"

  Invoke-CurlJson -Url "$BaseUrl/healthz" | Out-Null
  Invoke-CurlJson -Url "$BaseUrl/api/health" | Out-Null
  Invoke-CurlJson -Url "$BaseUrl/api/database/health" | Out-Null
  Invoke-CurlJson -Url "$BaseUrl/api/status" | Out-Null
  Invoke-CurlJson -Url "$BaseUrl/api/devices/status" | Out-Null
  Invoke-CurlJson -Url "$BaseUrl/api-docs.json" | Out-Null

  $envValues = Read-DotEnv ".env"
  $adminUser = $env:SEED_ADMIN_USER_ID
  $adminPassword = $env:SEED_ADMIN_PASSWORD
  $deviceIngestKey = $env:DEVICE_INGEST_API_KEY
  if (!$adminUser -and $envValues.ContainsKey("SEED_ADMIN_USER_ID")) {
    $adminUser = $envValues["SEED_ADMIN_USER_ID"]
  }
  if (!$adminPassword -and $envValues.ContainsKey("SEED_ADMIN_PASSWORD")) {
    $adminPassword = $envValues["SEED_ADMIN_PASSWORD"]
  }
  if (!$deviceIngestKey -and $envValues.ContainsKey("DEVICE_INGEST_API_KEY")) {
    $deviceIngestKey = $envValues["DEVICE_INGEST_API_KEY"]
  }
  $deviceIngestKey = [string]($deviceIngestKey -split "," | Select-Object -First 1).Trim()

  if ($adminUser -and $adminPassword) {
    $login = Invoke-CurlJson -Method "POST" -Url "$BaseUrl/api/auth/login" -Body @{
      userId = $adminUser
      password = $adminPassword
    }
    if (!$login.token) { throw "Login response did not include token" }
    Invoke-CurlJson -Url "$BaseUrl/api/auth/me" -BearerToken $login.token | Out-Null
  } else {
    Write-Warning "Skipping auth smoke because SEED_ADMIN_USER_ID or SEED_ADMIN_PASSWORD is not available."
  }

  $timestampPrefix = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss")
  $normalTrackId = "smoke-normal-$([guid]::NewGuid().ToString('N'))"
  $wrongTrackId = "smoke-wrong-$([guid]::NewGuid().ToString('N'))"

  $payloads = @(
    @{
      type = "normal-driving"
      zone_id = "ROUNDABOUT-01"
      track_id = $normalTrackId
      timestamp = "${timestampPrefix}Z"
      normal_moving_vehicle_count = 1
    },
    @{
      type = "normal-driving"
      zone_id = "ROUNDABOUT-01"
      track_id = $normalTrackId
      timestamp = "${timestampPrefix}Z"
      normal_moving_vehicle_count = 2
    },
    @{
      type = "wrong-way-level-1"
      zone_id = "ROUNDABOUT-01"
      track_id = $wrongTrackId
      timestamp = "${timestampPrefix}Z"
      warning_level = 1
      confidence = 0.95
      description = "Runtime smoke wrong-way stage 1"
    },
    @{
      type = "wrong-way-level-2"
      zone_id = "ROUNDABOUT-01"
      track_id = $wrongTrackId
      timestamp = "${timestampPrefix}Z"
      warning_level = 2
      confidence = 0.97
      description = "Runtime smoke wrong-way stage 2"
    },
    @{
      type = "situation-ended"
      zone_id = "ROUNDABOUT-01"
      track_id = $wrongTrackId
      timestamp = "${timestampPrefix}Z"
      warning_level = 0
      description = "Runtime smoke situation ended"
    }
  )

  $wrongwayEventIds = @()
  foreach ($payload in $payloads) {
    $response = Invoke-CurlJson -Method "POST" -Url "$BaseUrl/api/wrongway" -Body $payload -DeviceKey $deviceIngestKey
    if (!$response.ok) { throw "Wrongway smoke payload failed for $($payload.type)" }
    if ($payload.type -like "wrong-way-*" -and $response.eventId) {
      $wrongwayEventIds += $response.eventId
    }
  }

  if ($wrongwayEventIds.Count -eq 0) {
    throw "Wrongway smoke did not return any traffic event id."
  }

  foreach ($eventId in $wrongwayEventIds) {
    $detail = Invoke-CurlJson -Url "$BaseUrl/api/events/$eventId"
    if (!$detail.ok -or !$detail.event) {
      throw "Event detail smoke failed for $eventId"
    }
    if (!$detail.event.rawPayload) {
      throw "Event detail for $eventId did not include rawPayload"
    }
    if (!$detail.event.controlCommands -or $detail.event.controlCommands.Count -lt 1) {
      throw "Event detail for $eventId did not include linked controlCommands"
    }
    if (!$detail.event.controlCommands[0].packetHex) {
      throw "Linked control command for $eventId did not include packetHex"
    }
  }

  Invoke-CurlJson -Url "$BaseUrl/api/events/recent?limit=5" | Out-Null
  $summary = Invoke-CurlJson -Url "$BaseUrl/api/events/summary"
  if ($null -eq $summary.vehiclesPassed) {
    throw "Event summary did not include vehiclesPassed unique track count."
  }
  Invoke-CurlJson -Url "$BaseUrl/api/control-board/status" | Out-Null

  Write-Host "runtime smoke ok"
} finally {
  if ($StopCompose) {
    docker compose logs --no-color | Out-File -FilePath "delivery-compose.log" -Encoding utf8
    docker compose down
  }
}
