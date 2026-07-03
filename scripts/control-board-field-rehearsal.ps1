param(
  [string]$BaseUrl = "http://localhost:8080",
  [string]$UserId = "",
  [string]$Password = "",
  [string]$OutputRoot = "artifacts/field-control-board-rehearsal",
  [string]$Reviewer = "",
  [string]$SiteName = "unspecified",
  [switch]$AllowLiveTcp
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
    [string]$CookieJar = "",
    [string]$CsrfToken = ""
  )

  $curlArgs = @("-sS", "-f", "-X", $Method)
  if ($CookieJar) {
    $curlArgs += @("-b", $CookieJar, "-c", $CookieJar)
  }
  if ($CsrfToken) {
    $curlArgs += @("-H", "X-CSRF-Token: $CsrfToken")
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

function Get-CookieJarValue {
  param(
    [string]$CookieJar,
    [string]$Name
  )

  if (!(Test-Path $CookieJar)) { return "" }
  $line = Get-Content -LiteralPath $CookieJar | Where-Object {
    $_ -and !$_.StartsWith("#") -and ($_ -split "`t")[-2] -eq $Name
  } | Select-Object -Last 1
  if (!$line) { return "" }
  return ($line -split "`t")[-1]
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

function Assert-ControlBoardSafetyStatus {
  param(
    [object]$Status,
    [bool]$AllowLiveTcp
  )

  if ($null -eq $Status.PSObject.Properties["liveTcpReady"]) {
    throw "Control-board status did not expose liveTcpReady."
  }
  if ($null -eq $Status.PSObject.Properties["liveApproved"]) {
    throw "Control-board status did not expose liveApproved."
  }
  if ($null -eq $Status.PSObject.Properties["safetyStatus"]) {
    throw "Control-board status did not expose safetyStatus."
  }
  if ($Status.safetyStatus -notin @("DRY_RUN_SAFE", "LIVE_TCP_READY", "LIVE_TCP_REVIEW")) {
    throw "Control-board status safetyStatus must be DRY_RUN_SAFE, LIVE_TCP_READY, or LIVE_TCP_REVIEW."
  }
  if ($Status.mode -eq "DRY_RUN" -and $Status.safetyStatus -ne "DRY_RUN_SAFE") {
    throw "DRY_RUN mode must report DRY_RUN_SAFE."
  }
  if ($Status.mode -eq "LIVE_TCP" -and !$AllowLiveTcp) {
    throw "Control board is LIVE_TCP. Re-run with -AllowLiveTcp only after field hardware approval."
  }
  if ($Status.mode -eq "LIVE_TCP" -and $Status.liveTcpReady -and (!$Status.liveApproved -or $Status.safetyStatus -ne "LIVE_TCP_READY")) {
    throw "LIVE_TCP ready state must report LIVE_TCP_READY."
  }
  if ($Status.mode -eq "LIVE_TCP" -and !$Status.liveTcpReady -and $Status.safetyStatus -ne "LIVE_TCP_REVIEW") {
    throw "LIVE_TCP without host/port readiness must report LIVE_TCP_REVIEW."
  }
}

function Assert-CommandEvidence {
  param(
    [object]$Command,
    [string]$CommandType,
    [string]$Mode
  )

  if ($Command.commandType -ne $CommandType) {
    throw "$CommandType rehearsal returned commandType $($Command.commandType)."
  }
  if (!$Command.packetHex -or $Command.packetHex.Length -ne 20) {
    throw "$CommandType rehearsal packetHex must be a 10-byte binary frame encoded as 20 hex characters."
  }
  if ($Mode -ne "LIVE_TCP") {
    if ($Command.status -ne "DRY_RUN") {
      throw "$CommandType rehearsal expected DRY_RUN status, got $($Command.status)."
    }
    $dryRunLogs = @($Command.logs | Where-Object { $_.action -eq "DRY_RUN_SKIPPED_SEND" })
    if ($dryRunLogs.Count -lt 1) {
      throw "$CommandType rehearsal did not include DRY_RUN_SKIPPED_SEND log evidence."
    }
  }
}

$envValues = Read-DotEnv ".env"
$liveApproved = ""
if ($env:CONTROL_BOARD_LIVE_APPROVED) { $liveApproved = $env:CONTROL_BOARD_LIVE_APPROVED }
if (!$liveApproved -and $envValues.ContainsKey("CONTROL_BOARD_LIVE_APPROVED")) { $liveApproved = $envValues["CONTROL_BOARD_LIVE_APPROVED"] }
if (!$UserId -and $env:SEED_ADMIN_USER_ID) { $UserId = $env:SEED_ADMIN_USER_ID }
if (!$Password -and $env:SEED_ADMIN_PASSWORD) { $Password = $env:SEED_ADMIN_PASSWORD }
if (!$UserId -and $envValues.ContainsKey("SEED_ADMIN_USER_ID")) { $UserId = $envValues["SEED_ADMIN_USER_ID"] }
if (!$Password -and $envValues.ContainsKey("SEED_ADMIN_PASSWORD")) { $Password = $envValues["SEED_ADMIN_PASSWORD"] }
if (!$UserId -or !$Password) {
  throw "SEED_ADMIN_USER_ID and SEED_ADMIN_PASSWORD are required for control-board field rehearsal."
}

$csrfCookieName = "lidar_dashboard_csrf"
if ($env:AUTH_CSRF_COOKIE_NAME) { $csrfCookieName = $env:AUTH_CSRF_COOKIE_NAME }
if ($envValues.ContainsKey("AUTH_CSRF_COOKIE_NAME") -and $envValues["AUTH_CSRF_COOKIE_NAME"]) {
  $csrfCookieName = $envValues["AUTH_CSRF_COOKIE_NAME"]
}

$runId = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$outputDir = Join-Path $OutputRoot $runId
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
if (!$Reviewer) {
  $Reviewer = if ($env:USERNAME) { $env:USERNAME } elseif ($env:USER) { $env:USER } else { "field-reviewer" }
}
$cookieJar = Join-Path $env:TEMP "lidar-control-board-rehearsal-cookies-$([guid]::NewGuid().ToString('N')).txt"
$results = @()

try {
  $login = Invoke-CurlJson -Method "POST" -Url "$BaseUrl/api/auth/login" -CookieJar $cookieJar -Body @{
    userId = $UserId
    password = $Password
  }
  if ($login.token) { throw "Login response exposed token; expected HttpOnly cookie auth." }
  $csrfToken = Get-CookieJarValue -CookieJar $cookieJar -Name $csrfCookieName
  if (!$csrfToken) { throw "Login did not set CSRF cookie $csrfCookieName." }
  $results = Add-Result -Results $results -Name "operator cookie auth login" -Status "PASS" -Response @{
    ok = $login.ok
    authMode = $login.authMode
    user = $login.user
  }

  $initialStatus = Invoke-CurlJson -Url "$BaseUrl/api/control-board/status" -CookieJar $cookieJar
  Assert-ControlBoardSafetyStatus -Status $initialStatus -AllowLiveTcp ([bool]$AllowLiveTcp)
  $mode = [string]$initialStatus.mode
  if ($mode -eq "LIVE_TCP" -and !$AllowLiveTcp) {
    throw "Control board is LIVE_TCP. Re-run with -AllowLiveTcp only after field hardware approval."
  }
  if ($mode -eq "LIVE_TCP" -and $liveApproved.ToLowerInvariant() -ne "true") {
    throw "Control board is LIVE_TCP but CONTROL_BOARD_LIVE_APPROVED is not true. Record hardware owner approval before live TCP rehearsal."
  }
  $results = Add-Result -Results $results -Name "initial control-board status" -Status "PASS" -Response $initialStatus

  $commands = @("STAGE_1_ON", "STAGE_2_ON", "STAGE_2_RETURN")
  foreach ($commandType in $commands) {
    $response = Invoke-CurlJson -Method "POST" -Url "$BaseUrl/api/control-board/commands/test" -CookieJar $cookieJar -CsrfToken $csrfToken -Body @{
      commandType = $commandType
    }
    if (!$response.ok -or !$response.command) {
      throw "$commandType rehearsal did not return a command."
    }
    if (!$response.command.packetHex) {
      throw "$commandType rehearsal did not expose packetHex."
    }
    Assert-CommandEvidence -Command $response.command -CommandType $commandType -Mode $mode
    $results = Add-Result -Results $results -Name "$commandType command rehearsal" -Status "PASS" -Response $response
  }

  $finalStatus = Invoke-CurlJson -Url "$BaseUrl/api/control-board/status" -CookieJar $cookieJar
  Assert-ControlBoardSafetyStatus -Status $finalStatus -AllowLiveTcp ([bool]$AllowLiveTcp)
  if ($null -eq $finalStatus.PSObject.Properties["responseSampleCount"]) {
    throw "Control-board status did not expose responseSampleCount."
  }
  if ($null -eq $finalStatus.PSObject.Properties["averageResponseMs"]) {
    throw "Control-board status did not expose averageResponseMs."
  }
  $results = Add-Result -Results $results -Name "final control-board status metrics" -Status "PASS" -Response $finalStatus

  $manifest = [pscustomobject]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    evidenceType = "FIELD_REHEARSAL_PASS"
    baseUrl = $BaseUrl
    reviewer = $Reviewer
    siteName = $SiteName
    hostName = [System.Net.Dns]::GetHostName()
    allowLiveTcp = [bool]$AllowLiveTcp
    liveApproved = $liveApproved.ToLowerInvariant() -eq "true"
    initialMode = $mode
    finalMode = $finalStatus.mode
    safetyStatus = $finalStatus.safetyStatus
    liveTcpReady = $finalStatus.liveTcpReady
    results = $results
  }

  $manifest | ConvertTo-Json -Depth 20 | Out-File -LiteralPath (Join-Path $outputDir "manifest.json") -Encoding utf8
  $markdownLines = @(
    "# Control Board Field Rehearsal",
    "",
    "- Generated at: $($manifest.generatedAt)",
    "- Evidence type: $($manifest.evidenceType)",
    "- Base URL: $BaseUrl",
    "- Reviewer: $Reviewer",
    "- Site name: $SiteName",
    "- Host name: $($manifest.hostName)",
    "- Allow LIVE_TCP: $($manifest.allowLiveTcp)",
    "- Initial mode: $($manifest.initialMode)",
    "- Final mode: $($manifest.finalMode)",
    "- Safety status: $($manifest.safetyStatus)",
    "- Live TCP ready: $($manifest.liveTcpReady)",
    "",
    "## Results",
    "",
    "| Status | Check |",
    "| --- | --- |"
  ) + ($results | ForEach-Object { "| $($_.status) | $($_.name) |" }) + @(
    "",
    "## Safety",
    "",
    "- LIVE_TCP mode requires the explicit `-AllowLiveTcp` switch and prior hardware approval.",
    "- DRY_RUN mode verifies packet generation and command lifecycle without sending TCP frames.",
    ""
  )
  $markdownLines | Out-File -LiteralPath (Join-Path $outputDir "manifest.md") -Encoding utf8

  Write-Host "control-board field rehearsal ok"
  Write-Host "evidence written to $outputDir"
} finally {
  if (Test-Path $cookieJar) {
    Remove-Item -LiteralPath $cookieJar -Force
  }
}
