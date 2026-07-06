param(
  [string]$BaseUrl = $(if ($env:FIELD_BASE_URL) { $env:FIELD_BASE_URL } else { "http://localhost:8080" }),
  [switch]$StartCompose,
  [switch]$StopCompose,
  [int]$ReadyTimeoutSeconds = 90,
  [switch]$RequireDeviceKey
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
    [string]$CookieJar = "",
    [string]$CsrfToken = ""
  )

  $curlArgs = @("-sS", "-f", "-X", $Method)
  if ($BearerToken) {
    $curlArgs += @("-H", "Authorization: Bearer $BearerToken")
  }
  if ($DeviceKey) {
    $curlArgs += @("-H", "X-Device-Key: $DeviceKey")
  }
  if ($CsrfToken) {
    $curlArgs += @("-H", "X-CSRF-Token: $CsrfToken")
  }
  if ($CookieJar) {
    $curlArgs += @("-b", $CookieJar, "-c", $CookieJar)
  }
  $bodyFile = ""
  if ($null -ne $Body) {
    $json = $Body | ConvertTo-Json -Depth 12 -Compress
    $bodyFile = Join-Path $env:TEMP "lidar-runtime-smoke-body-$([guid]::NewGuid().ToString('N')).json"
    Set-Content -LiteralPath $bodyFile -Value $json -Encoding UTF8
    $curlArgs += @("-H", "Content-Type: application/json", "--data-binary", "@$bodyFile")
  }
  $curlArgs += $Url

  try {
    $output = & curl.exe @curlArgs
    if ($LASTEXITCODE -ne 0) {
      throw "HTTP $Method $Url failed with exit code $LASTEXITCODE"
    }
  } finally {
    if ($bodyFile -and (Test-Path $bodyFile)) {
      Remove-Item -LiteralPath $bodyFile -Force
    }
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
    [string]$CsrfToken = "",
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
  if ($CsrfToken) {
    $curlArgs += @("-H", "X-CSRF-Token: $CsrfToken")
  }
  if ($CookieJar) {
    $curlArgs += @("-b", $CookieJar, "-c", $CookieJar)
  }
  if ($ContentType) {
    $curlArgs += @("-H", "Content-Type: $ContentType")
  }
  $bodyFile = ""
  if ($null -ne $Body) {
    if ($RawBody) {
      $curlArgs += @("--data-binary", [string]$Body)
    } else {
      $json = $Body | ConvertTo-Json -Depth 12 -Compress
      $bodyFile = Join-Path $env:TEMP "lidar-runtime-smoke-body-$([guid]::NewGuid().ToString('N')).json"
      Set-Content -LiteralPath $bodyFile -Value $json -Encoding UTF8
      $curlArgs += @("-H", "Content-Type: application/json", "--data-binary", "@$bodyFile")
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
    if ($bodyFile -and (Test-Path $bodyFile)) {
      Remove-Item -LiteralPath $bodyFile -Force
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

function Assert-ResponseHeaderContains {
  param(
    [hashtable]$Response,
    [string]$Name,
    [string]$ExpectedPart,
    [string]$Label
  )

  $key = $Name.ToLowerInvariant()
  if (!$Response.headers.ContainsKey($key) -or !$Response.headers[$key].Contains($ExpectedPart)) {
    throw "$Label expected ${Name} to contain: $ExpectedPart."
  }
}

function Assert-SecurityHeaders {
  param(
    [hashtable]$Response,
    [string]$Label
  )

  Assert-ResponseHeader -Response $Response -Name "X-Content-Type-Options" -Expected "nosniff" -Label $Label
  Assert-ResponseHeader -Response $Response -Name "X-Frame-Options" -Expected "SAMEORIGIN" -Label $Label
  Assert-ResponseHeader -Response $Response -Name "Referrer-Policy" -Expected "strict-origin-when-cross-origin" -Label $Label
  Assert-ResponseHeader -Response $Response -Name "X-Permitted-Cross-Domain-Policies" -Expected "none" -Label $Label
  $cspHeader = $Response.headers["content-security-policy"]
  if (!$cspHeader -or !$cspHeader.Contains("default-src 'self'") -or !$cspHeader.Contains("object-src 'none'")) {
    throw "$Label expected Content-Security-Policy with default-src 'self' and object-src 'none'."
  }
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

function Assert-PropertyExists {
  param(
    [object]$Object,
    [string]$Name,
    [string]$Label
  )

  if ($null -eq $Object.PSObject.Properties[$Name]) {
    throw "$Label did not expose $Name."
  }
}

function Get-CookieJarValue {
  param(
    [string]$CookieJar,
    [string]$Name
  )

  if (!$CookieJar -or !(Test-Path -LiteralPath $CookieJar)) { return "" }
  foreach ($line in Get-Content -LiteralPath $CookieJar) {
    if (!$line -or $line.StartsWith("#")) { continue }
    $parts = $line -split "`t"
    if ($parts.Length -ge 7 -and $parts[5] -eq $Name) {
      return $parts[6]
    }
  }
  return ""
}

function Wait-HttpReady {
  param([string]$Url)

  $deadline = (Get-Date).AddSeconds($ReadyTimeoutSeconds)
  do {
    try {
      $ready = Invoke-CurlStatus -Url $Url
      if ($ready.statusCode -ge 200 -and $ready.statusCode -lt 500) {
        return
      }
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

  $healthz = Invoke-CurlStatus -Url "$BaseUrl/healthz"
  Assert-HttpStatus -Response $healthz -Expected 200 -Label "Nginx healthz smoke"
  Invoke-CurlJson -Url "$BaseUrl/api/health" | Out-Null
  Invoke-CurlJson -Url "$BaseUrl/api-docs.json" | Out-Null
  $swaggerUi = Invoke-CurlStatus -Url "$BaseUrl/api-docs/"
  Assert-HttpStatus -Response $swaggerUi -Expected 200 -Label "Swagger UI path smoke"

  $healthHeaders = Invoke-CurlStatus -Url "$BaseUrl/healthz"
  Assert-HttpStatus -Response $healthHeaders -Expected 200 -Label "healthz header smoke"
  Assert-SecurityHeaders -Response $healthHeaders -Label "healthz security header smoke"

  $spaHeaders = Invoke-CurlStatus -Url "$BaseUrl/"
  Assert-HttpStatus -Response $spaHeaders -Expected 200 -Label "SPA cache header smoke"
  Assert-SecurityHeaders -Response $spaHeaders -Label "SPA security header smoke"
  Assert-ResponseHeader -Response $spaHeaders -Name "Cache-Control" -Expected "no-store" -Label "SPA cache header smoke"

  $indexHtml = & curl.exe -sS -f "$BaseUrl/"
  if ($LASTEXITCODE -ne 0 -or !$indexHtml) {
    throw "SPA index smoke failed to load index HTML."
  }
  $assetMatch = [regex]::Match([string]$indexHtml, '(?<path>/assets/[^"'' >]+)')
  if (!$assetMatch.Success) {
    throw "SPA index smoke could not find a hashed /assets/ reference."
  }
  $assetHeaders = Invoke-CurlStatus -Url "$BaseUrl$($assetMatch.Groups["path"].Value)"
  Assert-HttpStatus -Response $assetHeaders -Expected 200 -Label "frontend asset cache header smoke"
  Assert-SecurityHeaders -Response $assetHeaders -Label "frontend asset security header smoke"
  Assert-ResponseHeaderContains -Response $assetHeaders -Name "Cache-Control" -ExpectedPart "public" -Label "frontend asset cache header smoke"
  Assert-ResponseHeaderContains -Response $assetHeaders -Name "Cache-Control" -ExpectedPart "max-age=2592000" -Label "frontend asset cache header smoke"
  Assert-ResponseHeaderContains -Response $assetHeaders -Name "Cache-Control" -ExpectedPart "immutable" -Label "frontend asset cache header smoke"

  $unauthMutation = Invoke-CurlStatus -Method "PATCH" -Url "$BaseUrl/api/events/runtime-smoke-missing/status" -Body @{
    status = "RESOLVED"
  }
  Assert-HttpStatus -Response $unauthMutation -Expected 401 -Label "unauthenticated mutation smoke"

  $nonJsonMutation = Invoke-CurlStatus -Method "POST" -Url "$BaseUrl/api/auth/login" -Body "not-json" -RawBody
  Assert-HttpStatus -Response $nonJsonMutation -Expected 415 -Label "non-json mutation smoke"

  $envValues = Read-DotEnv ".env"
  $adminUser = $env:RUNTIME_SMOKE_ADMIN_USER_ID
  if (!$adminUser) { $adminUser = $env:SEED_ADMIN_USER_ID }
  $adminPassword = $env:RUNTIME_SMOKE_ADMIN_PASSWORD
  if (!$adminPassword) { $adminPassword = $env:SEED_ADMIN_PASSWORD }
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
  $csrfCookieName = $env:AUTH_CSRF_COOKIE_NAME
  if (!$csrfCookieName -and $envValues.ContainsKey("AUTH_CSRF_COOKIE_NAME")) {
    $csrfCookieName = $envValues["AUTH_CSRF_COOKIE_NAME"]
  }
  if (!$csrfCookieName) {
    $csrfCookieName = "lidar_dashboard_csrf"
  }

  if ($deviceIngestKey) {
    $missingDeviceKeyCases = @(
      @{
        label = "missing X-Device-Key wrongway smoke"
        path = "/api/wrongway"
        body = @{
          type = "normal-driving"
          zone_id = "ROUNDABOUT-01"
          track_id = "smoke-missing-device-key"
          timestamp = "$(Get-Date -Format o)"
        }
      },
      @{
        label = "missing X-Device-Key lidar ingest smoke"
        path = "/api/ingest/lidar"
        body = @{
          type = "normal-driving"
          zone_id = "ROUNDABOUT-01"
          track_id = "smoke-missing-device-key-lidar"
          timestamp = "$(Get-Date -Format o)"
        }
      },
      @{
        label = "missing X-Device-Key control-board ingest smoke"
        path = "/api/ingest/control-board"
        body = @{
          packet = "02 A1 20 01 01 02 00 CD 03 0D"
          source = "runtime-smoke"
        }
      }
    )

    foreach ($case in $missingDeviceKeyCases) {
      $missingDeviceKey = Invoke-CurlStatus -Method "POST" -Url "$BaseUrl$($case.path)" -Body $case.body
      if ($RequireDeviceKey) {
        Assert-HttpStatus -Response $missingDeviceKey -Expected 401 -Label $case.label
      } elseif ($missingDeviceKey.statusCode -eq 401) {
        Write-Host "$($case.label) returned 401."
      } else {
        Write-Warning "$($case.label) returned HTTP $($missingDeviceKey.statusCode); rerun with -RequireDeviceKey after DEVICE_INGEST_API_KEY is injected into the delivery backend runtime."
      }
    }
  }

  $cookieJar = ""
  $csrfToken = ""

  if ($adminUser -and $adminPassword) {
    $cookieJar = Join-Path $env:TEMP "lidar-runtime-smoke-cookies-$([guid]::NewGuid().ToString('N')).txt"
    $login = Invoke-CurlJson -Method "POST" -Url "$BaseUrl/api/auth/login" -Body @{
      userId = $adminUser
      password = $adminPassword
    } -CookieJar $cookieJar
    if ($null -ne $login.PSObject.Properties["token"]) { throw "Login response must not expose token when HttpOnly cookie auth is enabled" }
    if ($login.authMode -ne "httpOnlyCookie") { throw "Login response did not report httpOnlyCookie auth mode" }
    $csrfToken = Get-CookieJarValue -CookieJar $cookieJar -Name $csrfCookieName
    if (!$csrfToken) { throw "Login did not set the CSRF cookie" }
    Invoke-CurlJson -Url "$BaseUrl/api/auth/me" -CookieJar $cookieJar | Out-Null

    $unauthRead = Invoke-CurlStatus -Url "$BaseUrl/api/events/summary"
    Assert-HttpStatus -Response $unauthRead -Expected 401 -Label "unauthenticated operator read smoke"

    Invoke-CurlJson -Url "$BaseUrl/api/database/health" -CookieJar $cookieJar | Out-Null
    Invoke-CurlJson -Url "$BaseUrl/api/status" -CookieJar $cookieJar | Out-Null
    Invoke-CurlJson -Url "$BaseUrl/api/devices/status" -CookieJar $cookieJar | Out-Null

    $missingCsrfMutation = Invoke-CurlStatus -Method "PATCH" -Url "$BaseUrl/api/events/runtime-smoke-missing/status" -Body @{
      status = "ACKNOWLEDGED"
    } -CookieJar $cookieJar
    Assert-HttpStatus -Response $missingCsrfMutation -Expected 403 -Label "cookie-auth mutation without CSRF smoke"
    $csrfMutation = Invoke-CurlStatus -Method "PATCH" -Url "$BaseUrl/api/events/runtime-smoke-missing/status" -Body @{
      status = "ACKNOWLEDGED"
    } -CookieJar $cookieJar -CsrfToken $csrfToken
    Assert-HttpStatus -Response $csrfMutation -Expected 404 -Label "cookie-auth mutation with CSRF smoke"
  } else {
    throw "Runtime smoke requires SEED_ADMIN_USER_ID and SEED_ADMIN_PASSWORD for protected operator API checks."
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
    $detail = Invoke-CurlJson -Url "$BaseUrl/api/events/$eventId" -CookieJar $cookieJar
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

  $tcpFrameTest = Invoke-CurlJson -Method "POST" -Url "$BaseUrl/api/ingest/control-board/tcp/test" -Body @{
    host = "127.0.0.1"
    port = 5001
    samplePacket = "02 A1 20 01 01 02 00 CD 03 0D"
  } -DeviceKey $deviceIngestKey
  if (!$tcpFrameTest.ok -or $tcpFrameTest.mode -ne "TCP_FRAME_TEST") {
    throw "Control-board TCP frame parser smoke did not return TCP_FRAME_TEST mode."
  }
  if (!$tcpFrameTest.tcp -or $tcpFrameTest.tcp.transport -ne "tcp") {
    throw "Control-board TCP frame parser smoke did not report tcp transport."
  }
  if (!$tcpFrameTest.event -or $tcpFrameTest.event.rawSummary.crcStatus -ne "VALID") {
    throw "Control-board TCP frame parser smoke did not validate the sample packet CRC."
  }

  Invoke-CurlJson -Url "$BaseUrl/api/events/recent?limit=5" -CookieJar $cookieJar | Out-Null
  $summary = Invoke-CurlJson -Url "$BaseUrl/api/events/summary" -CookieJar $cookieJar
  Assert-NumberProperty -Object $summary -Name "vehiclesPassed" -Label "Event summary unique track count"
  Assert-NumberProperty -Object $summary -Name "wrongwayVehicles" -Label "Event summary unique wrong-way vehicle count"
  Assert-NumberProperty -Object $summary -Name "wrongWayEvents" -Label "Event summary raw wrong-way event count"
  Assert-NumberProperty -Object $summary -Name "wrongwayRate" -Label "Event summary wrong-way rate"
  $statistics = Invoke-CurlJson -Url "$BaseUrl/api/statistics/traffic?range=daily" -CookieJar $cookieJar
  if (!$statistics.ok -or !$statistics.totals -or !$statistics.buckets -or !$statistics.zones) {
    throw "Traffic statistics smoke did not include ok, totals, buckets, and zones."
  }
  Assert-NumberProperty -Object $statistics.totals -Name "normalVehicles" -Label "Traffic statistics totals"
  Assert-NumberProperty -Object $statistics.totals -Name "wrongwayVehicles" -Label "Traffic statistics totals"
  if ($null -eq $statistics.totals.commandSuccessRate) {
    Write-Warning "Traffic statistics commandSuccessRate is null; this is expected until LIVE_TCP ACK/FAILED samples exist."
  }
  Assert-PropertyExists -Object $statistics.totals -Name "averageResponseMs" -Label "Traffic statistics totals"

  $controlBoardStatus = Invoke-CurlJson -Url "$BaseUrl/api/control-board/status" -CookieJar $cookieJar
  if (!$controlBoardStatus.ok -or !$controlBoardStatus.byStatus) {
    throw "Control-board status smoke did not include ok and byStatus."
  }
  Assert-PropertyExists -Object $controlBoardStatus -Name "averageResponseMs" -Label "Control-board status"
  Assert-NumberProperty -Object $controlBoardStatus -Name "responseSampleCount" -Label "Control-board status"
  Assert-PropertyExists -Object $controlBoardStatus -Name "liveTcpReady" -Label "Control-board status"
  Assert-PropertyExists -Object $controlBoardStatus -Name "liveApproved" -Label "Control-board status"
  Assert-PropertyExists -Object $controlBoardStatus -Name "safetyStatus" -Label "Control-board status"
  if ($controlBoardStatus.safetyStatus -notin @("DRY_RUN_SAFE", "LIVE_TCP_READY", "LIVE_TCP_REVIEW")) {
    throw "Control-board status safetyStatus must be DRY_RUN_SAFE, LIVE_TCP_READY, or LIVE_TCP_REVIEW."
  }
  if ($controlBoardStatus.mode -eq "DRY_RUN" -and $controlBoardStatus.safetyStatus -ne "DRY_RUN_SAFE") {
    throw "Control-board DRY_RUN mode must report DRY_RUN_SAFE."
  }
  if ($controlBoardStatus.mode -eq "LIVE_TCP" -and $controlBoardStatus.liveTcpReady -and (!$controlBoardStatus.liveApproved -or $controlBoardStatus.safetyStatus -ne "LIVE_TCP_READY")) {
    throw "Control-board LIVE_TCP ready state must report LIVE_TCP_READY."
  }
  if ($controlBoardStatus.mode -eq "LIVE_TCP" -and !$controlBoardStatus.liveTcpReady -and $controlBoardStatus.safetyStatus -ne "LIVE_TCP_REVIEW") {
    throw "Control-board LIVE_TCP without host/port readiness must report LIVE_TCP_REVIEW."
  }
  if ($controlBoardStatus.latestCommand -and !($controlBoardStatus.latestCommand.PSObject.Properties.Name -contains "responseDurationMs")) {
    throw "Control-board status latestCommand did not expose responseDurationMs."
  }

  $logoutStatus = Invoke-CurlStatus -Method "POST" -Url "$BaseUrl/api/auth/logout" -Body @{} -CookieJar $cookieJar -CsrfToken $csrfToken
  Assert-HttpStatus -Response $logoutStatus -Expected 200 -Label "cookie-auth logout smoke"
  $afterLogoutMe = Invoke-CurlStatus -Url "$BaseUrl/api/auth/me" -CookieJar $cookieJar
  Assert-HttpStatus -Response $afterLogoutMe -Expected 401 -Label "logout clears cookie smoke"
  if (Test-Path $cookieJar) {
    Remove-Item -LiteralPath $cookieJar -Force
  }

  Write-Host "runtime smoke ok"
} finally {
  if ($StopCompose) {
    docker compose logs --no-color | Out-File -FilePath "delivery-compose.log" -Encoding utf8
    docker compose down
  }
}
