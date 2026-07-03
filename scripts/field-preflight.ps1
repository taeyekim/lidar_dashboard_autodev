param(
  [string]$BaseUrl = "http://localhost:8080",
  [string]$OutputRoot = "artifacts/field-preflight",
  [string]$Reviewer = "",
  [string]$SiteName = "",
  [switch]$AllowLiveTcp,
  [switch]$RequireDeviceKey,
  [switch]$RequireHttpsCookies,
  [switch]$RequireSwaggerAllowlist,
  [switch]$Strict
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-DotEnv {
  param([string]$Path)

  $values = @{}
  if (!(Test-Path -LiteralPath $Path)) { return $values }

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

function Get-EnvValue {
  param(
    [hashtable]$Values,
    [string]$Name
  )

  $processValue = [Environment]::GetEnvironmentVariable($Name)
  if ($processValue) { return $processValue }
  if ($Values.ContainsKey($Name)) { return $Values[$Name] }
  return ""
}

function Add-Check {
  param(
    [object[]]$Checks,
    [string]$Name,
    [string]$Status,
    [string]$Message,
    [string]$Severity = "info"
  )

  return $Checks + [pscustomobject]@{
    name = $Name
    status = $Status
    severity = $Severity
    message = $Message
  }
}

$runId = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$outputDir = Join-Path $OutputRoot $runId
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$envValues = Read-DotEnv ".env"
$checks = @()

$envExists = Test-Path -LiteralPath ".env"
$checks = Add-Check -Checks $checks -Name ".env presence" -Status $(if ($envExists) { "PASS" } else { "REVIEW" }) -Severity $(if ($envExists) { "info" } else { "warning" }) -Message $(if ($envExists) { ".env is present." } else { ".env is missing; copy .env.example and fill field values before acceptance." })

$jwtSecret = Get-EnvValue -Values $envValues -Name "JWT_SECRET"
$checks = Add-Check -Checks $checks -Name "JWT secret placeholder" -Status $(if ($jwtSecret -and $jwtSecret -ne "change-this-to-a-long-random-secret") { "PASS" } else { "REVIEW" }) -Severity "critical" -Message $(if ($jwtSecret -and $jwtSecret -ne "change-this-to-a-long-random-secret") { "JWT_SECRET is set to a non-example value." } else { "JWT_SECRET is missing or still uses the example placeholder." })

$adminPassword = Get-EnvValue -Values $envValues -Name "SEED_ADMIN_PASSWORD"
$checks = Add-Check -Checks $checks -Name "seed admin password" -Status $(if ($adminPassword -and $adminPassword -ne "admin1234!") { "PASS" } else { "REVIEW" }) -Severity "critical" -Message $(if ($adminPassword -and $adminPassword -ne "admin1234!") { "SEED_ADMIN_PASSWORD is not the example password." } else { "SEED_ADMIN_PASSWORD is missing or still uses the example password." })

$deviceKey = Get-EnvValue -Values $envValues -Name "DEVICE_INGEST_API_KEY"
$checks = Add-Check -Checks $checks -Name "device ingest key" -Status $(if ($deviceKey) { "PASS" } elseif ($RequireDeviceKey) { "REVIEW" } else { "SKIPPED" }) -Severity $(if ($RequireDeviceKey) { "critical" } else { "warning" }) -Message $(if ($deviceKey) { "DEVICE_INGEST_API_KEY is configured; value is intentionally redacted." } elseif ($RequireDeviceKey) { "DEVICE_INGEST_API_KEY is required for this acceptance run but is missing." } else { "DEVICE_INGEST_API_KEY is not set; trusted-LAN exception must be accepted by the field reviewer." })

$dryRun = (Get-EnvValue -Values $envValues -Name "CONTROL_BOARD_DRY_RUN").ToLowerInvariant()
$liveApproved = (Get-EnvValue -Values $envValues -Name "CONTROL_BOARD_LIVE_APPROVED").ToLowerInvariant()
$hostValue = Get-EnvValue -Values $envValues -Name "CONTROL_BOARD_HOST"
$portValue = Get-EnvValue -Values $envValues -Name "CONTROL_BOARD_PORT"
if ($AllowLiveTcp) {
  $liveReady = $dryRun -eq "false" -and $liveApproved -eq "true" -and $hostValue -and $portValue
  $checks = Add-Check -Checks $checks -Name "live TCP readiness" -Status $(if ($liveReady) { "PASS" } else { "REVIEW" }) -Severity "critical" -Message $(if ($liveReady) { "LIVE_TCP requested, CONTROL_BOARD_LIVE_APPROVED=true, and CONTROL_BOARD_HOST/PORT are configured." } else { "LIVE_TCP requested, but CONTROL_BOARD_DRY_RUN=false, CONTROL_BOARD_LIVE_APPROVED=true, and CONTROL_BOARD_HOST/PORT are not all satisfied." })
} else {
  $dryRunSafe = $dryRun -ne "false"
  $checks = Add-Check -Checks $checks -Name "dry-run safety" -Status $(if ($dryRunSafe) { "PASS" } else { "REVIEW" }) -Severity "critical" -Message $(if ($dryRunSafe) { "CONTROL_BOARD_DRY_RUN is not false; live TCP will not be used by default." } else { "CONTROL_BOARD_DRY_RUN=false while -AllowLiveTcp was not provided." })
}

$secureCookie = (Get-EnvValue -Values $envValues -Name "AUTH_COOKIE_SECURE").ToLowerInvariant()
$sameSite = (Get-EnvValue -Values $envValues -Name "AUTH_COOKIE_SAMESITE").ToLowerInvariant()
$httpsCookieReady = $secureCookie -eq "true" -and @("lax", "strict", "none") -contains $sameSite
$checks = Add-Check -Checks $checks -Name "auth cookie delivery settings" -Status $(if ($httpsCookieReady -or !$RequireHttpsCookies) { if ($httpsCookieReady) { "PASS" } else { "SKIPPED" } } else { "REVIEW" }) -Severity $(if ($RequireHttpsCookies) { "critical" } else { "warning" }) -Message $(if ($httpsCookieReady) { "AUTH_COOKIE_SECURE=true and AUTH_COOKIE_SAMESITE is valid." } elseif ($RequireHttpsCookies) { "HTTPS cookie settings are required but AUTH_COOKIE_SECURE/AUTH_COOKIE_SAMESITE are not ready." } else { "HTTPS cookie settings are not enforced for this run." })

$swaggerAllow = Get-EnvValue -Values $envValues -Name "NGINX_SWAGGER_ALLOW"
$swaggerRestricted = $swaggerAllow -and $swaggerAllow -ne "all"
$checks = Add-Check -Checks $checks -Name "Swagger allowlist" -Status $(if ($swaggerRestricted) { "PASS" } elseif ($RequireSwaggerAllowlist) { "REVIEW" } else { "SKIPPED" }) -Severity $(if ($RequireSwaggerAllowlist) { "critical" } else { "warning" }) -Message $(if ($swaggerRestricted) { "NGINX_SWAGGER_ALLOW is restricted." } elseif ($RequireSwaggerAllowlist) { "NGINX_SWAGGER_ALLOW must be restricted for this acceptance run." } else { "NGINX_SWAGGER_ALLOW is not restricted; field reviewer must accept internal-only Swagger exposure." })

$reviewCount = @($checks | Where-Object { $_.status -eq "REVIEW" }).Count
$skippedCount = @($checks | Where-Object { $_.status -eq "SKIPPED" }).Count
$overallStatus = if ($reviewCount -gt 0) { "REVIEW" } elseif ($skippedCount -gt 0) { "PASS_WITH_SKIPS" } else { "PASS" }

$manifest = [pscustomobject]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  baseUrl = $BaseUrl
  reviewer = $Reviewer
  siteName = $SiteName
  status = $overallStatus
  strict = [bool]$Strict
  allowLiveTcp = [bool]$AllowLiveTcp
  requireDeviceKey = [bool]$RequireDeviceKey
  requireHttpsCookies = [bool]$RequireHttpsCookies
  requireSwaggerAllowlist = [bool]$RequireSwaggerAllowlist
  reviewCount = $reviewCount
  skippedCount = $skippedCount
  checks = $checks
}

$manifest | ConvertTo-Json -Depth 20 | Out-File -LiteralPath (Join-Path $outputDir "manifest.json") -Encoding utf8
$markdownLines = @(
  "# Field Acceptance Preflight",
  "",
  "- Generated at: $($manifest.generatedAt)",
  "- Base URL: $BaseUrl",
  "- Reviewer: $Reviewer",
  "- Site name: $SiteName",
  "- Status: $overallStatus",
  "- Strict: $([bool]$Strict)",
  "- Review count: $reviewCount",
  "- Skipped count: $skippedCount",
  "",
  "## Checks",
  "",
  "| Status | Severity | Check | Message |",
  "| --- | --- | --- | --- |"
) + ($checks | ForEach-Object { "| $($_.status) | $($_.severity) | $($_.name) | $($_.message) |" }) + @("")

$markdownLines | Out-File -LiteralPath (Join-Path $outputDir "manifest.md") -Encoding utf8

Write-Host "field preflight evidence written to $outputDir"
Write-Host "field preflight status: $overallStatus"

if ($Strict -and $overallStatus -ne "PASS") {
  throw "Field preflight completed with ${overallStatus}. See $outputDir for details."
}
