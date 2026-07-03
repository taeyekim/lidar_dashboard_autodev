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
    [string]$DeviceKey = "",
    [string]$CookieJar = ""
  )

  $curlArgs = @("-sS", "-f", "-X", $Method)
  if ($BearerToken) {
    $curlArgs += @("-H", "Authorization: Bearer $BearerToken")
  }
  if ($DeviceKey) {
    $curlArgs += @("-H", "X-Device-Key: $DeviceKey")
  }
  if ($CookieJar) {
    $curlArgs += @("-b", $CookieJar, "-c", $CookieJar)
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

function Invoke-CurlStatus {
  param(
    [string]$Method = "GET",
    [string]$Url,
    [object]$Body = $null,
    [string]$BearerToken = "",
    [string]$DeviceKey = "",
    [string]$ContentType = "",
    [string]$CookieJar = "",
    [switch]$RawBody
  )

  $headersPath = Join-Path $env:TEMP "lidar-runtime-smoke-headers-$([guid]::NewGuid().ToString('N')).txt"
  $curlArgs = @("-sS", "-o", "NUL", "-D", $headersPath, "-w", "%{http_code}", "-X", $Method)
  if ($BearerToken) {
    $curlArgs += @("-H", "Authorization: Bearer $BearerToken")
  }
  if ($DeviceKey) {
    $curlArgs += @("-H", "X-Device-Key: $DeviceKey")
  }
  if ($CookieJar) {
    $curlArgs += @("-b", $CookieJar, "-c", $CookieJar)
  }
  if ($ContentType) {
    $curlArgs += @("-H", "Content-Type: $ContentType")
  }
  if ($null -ne $Body) {
    if ($RawBody) {
      $curlArgs += @("--data-binary", [string]$Body)
    } else {
      $json = $Body | ConvertTo-Json -Depth 12 -Compress
      $curlArgs += @("-H", "Content-Type: application/json", "-d", $json)
    }
  }
  $curlArgs += $Url

  try {
    $statusCode = & curl.exe @curlArgs
    if ($LASTEXITCODE -ne 0) {
      throw "HTTP $Method $Url status probe failed with exit code $LASTEXITCODE"
    }
    $headers = @{}
    if (Test-Path $headersPath) {
      Get-Content -LiteralPath $headersPath | ForEach-Object {
        $line = $_
        $index = $line.IndexOf(":")
        if ($index -gt 0) {
          $name = $line.Substring(0, $index).Trim().ToLowerInvariant()
          $value = $line.Substring($index + 1).Trim()
          $headers[$name] = $value
        }
      }
    }

    return @{
      statusCode = [int]$statusCode
      headers = $headers
    }
  } finally {
    if (Test-Path $headersPath) {
      Remove-Item -LiteralPath $headersPath -Force
    }
  }
}

function Assert-HttpStatus {
  param(
    [hashtable]$Response,
    [int]$Expected,
    [string]$Label
  )

  if ($Response.statusCode -ne $Expected) {
    throw "$Label expected HTTP $Expected, got $($Response.statusCode)."
  }
}

function Assert-ResponseHeader {
  param(
    [hashtable]$Response,
    [string]$Name,
    [string]$Expected,
    [string]$Label
  )

  $key = $Name.ToLowerInvariant()
  if (!$Response.headers.ContainsKey($key) -or $Response.headers[$key] -ne $Expected) {
    throw "$Label expected ${Name}: $Expected."
  }
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

  $healthHeaders = Invoke-CurlStatus -Url "$BaseUrl/healthz"
  Assert-HttpStatus -Response $healthHeaders -Expected 200 -Label "healthz header smoke"
  Assert-ResponseHeader -Response $healthHeaders -Name "X-Content-Type-Options" -Expected "nosniff" -Label "healthz security header smoke"
  Assert-ResponseHeader -Response $healthHeaders -Name "X-Frame-Options" -Expected "SAMEORIGIN" -Label "healthz security header smoke"

  $unauthMutation = Invoke-CurlStatus -Method "PATCH" -Url "$BaseUrl/api/events/runtime-smoke-missing/status" -Body @{
    status = "RESOLVED"
  }
  Assert-HttpStatus -Response $unauthMutation -Expected 401 -Label "unauthenticated mutation smoke"

  $nonJsonMutation = Invoke-CurlStatus -Method "POST" -Url "$BaseUrl/api/auth/login" -Body "not-json" -RawBody
  Assert-HttpStatus -Response $nonJsonMutation -Expected 415 -Label "non-json mutation smoke"

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

  if ($deviceIngestKey) {
    $missingDeviceKey = Invoke-CurlStatus -Method "POST" -Url "$BaseUrl/api/wrongway" -Body @{
      type = "normal-driving"
      zone_id = "ROUNDABOUT-01"
      track_id = "smoke-missing-device-key"
      timestamp = "$(Get-Date -Format o)"
    }
    Assert-HttpStatus -Response $missingDeviceKey -Expected 401 -Label "missing X-Device-Key smoke"
  }

  if ($adminUser -and $adminPassword) {
    $cookieJar = Join-Path $env:TEMP "lidar-runtime-smoke-cookies-$([guid]::NewGuid().ToString('N')).txt"
    $login = Invoke-CurlJson -Method "POST" -Url "$BaseUrl/api/auth/login" -Body @{
      userId = $adminUser
      password = $adminPassword
    } -CookieJar $cookieJar
    if ($login.token) { throw "Login response must not expose token when HttpOnly cookie auth is enabled" }
    if ($login.authMode -ne "httpOnlyCookie") { throw "Login response did not report httpOnlyCookie auth mode" }
    Invoke-CurlJson -Url "$BaseUrl/api/auth/me" -CookieJar $cookieJar | Out-Null
    Invoke-CurlJson -Method "POST" -Url "$BaseUrl/api/auth/logout" -Body @{} -CookieJar $cookieJar | Out-Null
    if (Test-Path $cookieJar) {
      Remove-Item -LiteralPath $cookieJar -Force
    }
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
    }
  )

  $wrongwayEventIds = @()
  $stage1EventId = ""
  foreach ($payload in $payloads) {
    $response = Invoke-CurlJson -Method "POST" -Url "$BaseUrl/api/wrongway" -Body $payload -DeviceKey $deviceIngestKey
    if (!$response.ok) { throw "Wrongway smoke payload failed for $($payload.type)" }
    if ($payload.type -like "wrong-way-*" -and $response.eventId) {
      $wrongwayEventIds += $response.eventId
    }
    if ($payload.type -eq "wrong-way-level-1") {
      $stage1EventId = $response.eventId
    }
  }

  if ($wrongwayEventIds.Count -eq 0) {
    throw "Wrongway smoke did not return any traffic event id."
  }

  $duplicateStage1 = Invoke-CurlJson -Method "POST" -Url "$BaseUrl/api/wrongway" -Body @{
    type = "wrong-way-level-1"
    zone_id = "ROUNDABOUT-01"
    track_id = $wrongTrackId
    timestamp = "${timestampPrefix}Z"
    warning_level = 1
    confidence = 0.96
    description = "Runtime smoke duplicate wrong-way stage 1"
  } -DeviceKey $deviceIngestKey
  if (!$duplicateStage1.ok -or !$duplicateStage1.eventReused) {
    throw "Duplicate wrong-way stage 1 did not report eventReused=true."
  }
  if ($stage1EventId -and $duplicateStage1.eventId -ne $stage1EventId) {
    throw "Duplicate wrong-way stage 1 did not reuse the original event id."
  }

  $ended = Invoke-CurlJson -Method "POST" -Url "$BaseUrl/api/wrongway" -Body @{
    type = "situation-ended"
    zone_id = "ROUNDABOUT-01"
    track_id = $wrongTrackId
    timestamp = "${timestampPrefix}Z"
    warning_level = 0
    description = "Runtime smoke situation ended"
  } -DeviceKey $deviceIngestKey
  if (!$ended.ok -or !$ended.resolvedEventIds -or $ended.resolvedEventIds.Count -lt 1) {
    throw "Situation-ended smoke did not resolve any active wrong-way events."
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
