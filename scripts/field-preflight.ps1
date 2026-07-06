param(
  [string]$BaseUrl = $(if ($env:FIELD_BASE_URL) { $env:FIELD_BASE_URL } else { "http://localhost:8080" }),
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
    [string]$Severity = "info",
    [string]$NextAction = "",
    [string]$EvidenceCommand = "",
    [string]$DoneWhen = ""
  )

  return $Checks + [pscustomobject]@{
    name = $Name
    status = $Status
    severity = $Severity
    message = $Message
    nextAction = if ($NextAction) { $NextAction } else { Get-PreflightNextAction -Name $Name }
    evidenceCommand = if ($EvidenceCommand) { $EvidenceCommand } else { Get-PreflightEvidenceCommand -Name $Name }
    doneWhen = if ($DoneWhen) { $DoneWhen } else { Get-PreflightDoneWhen -Name $Name }
  }
}

function Get-PreflightNextAction {
  param([string]$Name)

  $actions = @{
    ".env presence" = "Copy .env.example to .env on the delivery host and fill field-only values."
    "JWT secret placeholder" = "Set JWT_SECRET to a unique long random field-only secret; do not paste the value into evidence."
    "seed admin password" = "Set SEED_ADMIN_PASSWORD to a non-example value before seeding the intended field DB."
    "device ingest key" = "Set DEVICE_INGEST_API_KEY and configure the LiDAR sender header, or attach a signed trusted-LAN exception."
    "live TCP readiness" = "Set CONTROL_BOARD_DRY_RUN=false, CONTROL_BOARD_LIVE_APPROVED=true, CONTROL_BOARD_HOST, and CONTROL_BOARD_PORT only for approved live TCP rehearsal."
    "dry-run safety" = "Keep CONTROL_BOARD_DRY_RUN unset/true for safe review, or rerun with -AllowLiveTcp after hardware owner approval."
    "auth cookie delivery settings" = "Set AUTH_COOKIE_SECURE=true and AUTH_COOKIE_SAMESITE to lax, strict, or none for the final HTTPS topology."
    "CORS trusted origins" = "Set CORS_ORIGINS to explicit operator UI origins only; do not use wildcard/all."
    "Swagger allowlist" = "Set NGINX_SWAGGER_ALLOW to the approved operator/internal CIDR, or attach accepted internal-only exposure evidence."
    "Nginx wrong-way rate limit" = "Set NGINX_WRONGWAY_RATE_LIMIT and NGINX_WRONGWAY_BURST after confirming the LiDAR sender event rate."
    "Nginx content security policy" = "Set NGINX_CONTENT_SECURITY_POLICY after reviewing final camera, LiDAR, Swagger, and operator UI hosts."
  }
  if ($actions.ContainsKey($Name)) { return $actions[$Name] }
  return "Resolve the check, rerun field preflight, and attach the updated manifest."
}

function Get-PreflightEvidenceCommand {
  param([string]$Name)

  $strictCommand = "npm.cmd run field:preflight -- -BaseUrl <delivery-url> -Reviewer <field-reviewer> -SiteName <site-name> -RequireDeviceKey -RequireHttpsCookies -RequireSwaggerAllowlist -Strict"
  $commands = @{
    ".env presence" = "Inspect .env key presence on the delivery host without printing values; rerun $strictCommand"
    "JWT secret placeholder" = "Record JWT_SECRET as configured/non-placeholder only; rerun $strictCommand"
    "seed admin password" = "Record SEED_ADMIN_PASSWORD as configured/non-example only; rerun $strictCommand"
    "device ingest key" = "Record DEVICE_INGEST_API_KEY configured status or attach artifacts/manual/field-risk-acceptance.md; rerun $strictCommand"
    "live TCP readiness" = "Run approved live TCP rehearsal after hardware approval, then rerun npm.cmd run field:preflight -- -BaseUrl <delivery-url> -Reviewer <field-reviewer> -SiteName <site-name> -AllowLiveTcp -RequireDeviceKey -RequireHttpsCookies -RequireSwaggerAllowlist -Strict"
    "dry-run safety" = "Rerun npm.cmd run field:preflight -- -BaseUrl <delivery-url> -Reviewer <field-reviewer> -SiteName <site-name> or use -AllowLiveTcp only with approval."
    "auth cookie delivery settings" = "Record cookie posture without secret values; rerun $strictCommand"
    "CORS trusted origins" = "Record the approved origin list; rerun $strictCommand"
    "Swagger allowlist" = "Record the approved internal CIDR; rerun $strictCommand"
    "Nginx wrong-way rate limit" = "Record expected LiDAR sender rate/burst decision; rerun $strictCommand"
    "Nginx content security policy" = "Record CSP review decision; rerun $strictCommand"
  }
  if ($commands.ContainsKey($Name)) { return $commands[$Name] }
  return $strictCommand
}

function Get-PreflightDoneWhen {
  param([string]$Name)

  $doneWhen = @{
    ".env presence" = ".env exists and the strict preflight no longer reports .env presence as REVIEW."
    "JWT secret placeholder" = "JWT_SECRET is present, non-placeholder, and strict preflight reports PASS."
    "seed admin password" = "SEED_ADMIN_PASSWORD is present, non-example, and strict preflight reports PASS."
    "device ingest key" = "DEVICE_INGEST_API_KEY is configured, or the trusted-LAN exception is signed and referenced."
    "live TCP readiness" = "Live TCP host, port, dry-run=false, live approval=true, and approved rehearsal evidence are present."
    "dry-run safety" = "Dry-run is safe for review, or live TCP is explicitly approved and checked with -AllowLiveTcp."
    "auth cookie delivery settings" = "AUTH_COOKIE_SECURE and AUTH_COOKIE_SAMESITE match the final HTTPS route."
    "CORS trusted origins" = "CORS_ORIGINS contains approved operator UI origins only."
    "Swagger allowlist" = "NGINX_SWAGGER_ALLOW is restricted or the accepted internal-only exposure is attached."
    "Nginx wrong-way rate limit" = "Wrong-way rate limit and burst values are configured for the expected LiDAR sender profile."
    "Nginx content security policy" = "CSP is configured for the final delivery topology and accepted by the reviewer."
  }
  if ($doneWhen.ContainsKey($Name)) { return $doneWhen[$Name] }
  return "The check reports PASS in the latest strict field preflight manifest."
}

function New-CloseoutChecklist {
  param([object[]]$Checks)

  return @($Checks | Where-Object { $_.status -in @("REVIEW", "SKIPPED") } | ForEach-Object {
    [pscustomobject]@{
      name = $_.name
      status = $_.status
      severity = $_.severity
      nextAction = $_.nextAction
      evidenceCommand = $_.evidenceCommand
      doneWhen = $_.doneWhen
    }
  })
}

function Split-ListValue {
  param([string]$Value)

  if (!$Value) { return @() }
  return @($Value.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

function Get-GitValue {
  param([string[]]$Arguments)

  $result = & git @Arguments 2>$null
  if ($null -eq $result) { return "" }
  return (($result | Out-String).Trim())
}

function Get-GitState {
  $upstream = Get-GitValue -Arguments @("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
  $upstreamCommit = if ([string]::IsNullOrWhiteSpace($upstream)) { "" } else { Get-GitValue -Arguments @("rev-parse", "@{u}") }
  $commit = Get-GitValue -Arguments @("rev-parse", "HEAD")
  $status = Get-GitValue -Arguments @("status", "--short")

  return [pscustomobject]@{
    branch = Get-GitValue -Arguments @("rev-parse", "--abbrev-ref", "HEAD")
    commit = $commit
    clean = [string]::IsNullOrWhiteSpace($status)
    upstream = if ([string]::IsNullOrWhiteSpace($upstream)) { $null } else { $upstream }
    upstreamCommit = if ([string]::IsNullOrWhiteSpace($upstreamCommit)) { $null } else { $upstreamCommit }
    pushed = ![string]::IsNullOrWhiteSpace($commit) -and ![string]::IsNullOrWhiteSpace($upstreamCommit) -and $commit -eq $upstreamCommit
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
$adminPasswordIsPlaceholder = !$adminPassword -or $adminPassword -eq "admin1234!" -or $adminPassword -match "^change-this-"
$checks = Add-Check -Checks $checks -Name "seed admin password" -Status $(if (!$adminPasswordIsPlaceholder) { "PASS" } else { "REVIEW" }) -Severity "critical" -Message $(if (!$adminPasswordIsPlaceholder) { "SEED_ADMIN_PASSWORD is not the example password." } else { "SEED_ADMIN_PASSWORD is missing or still uses an example placeholder." })

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

$corsOrigins = Get-EnvValue -Values $envValues -Name "CORS_ORIGINS"
$corsOriginList = @(Split-ListValue -Value $corsOrigins)
$openCorsOrigins = @($corsOriginList | Where-Object { $_.ToLowerInvariant() -in @("*", "all") })
$corsTrustedOnly = $corsOriginList.Count -gt 0 -and $openCorsOrigins.Count -eq 0
$checks = Add-Check -Checks $checks -Name "CORS trusted origins" -Status $(if ($corsTrustedOnly) { "PASS" } else { "REVIEW" }) -Severity "warning" -Message $(if ($corsTrustedOnly) { "CORS_ORIGINS contains explicit operator UI origins only." } else { "CORS_ORIGINS is missing, wildcard, or open; restrict it to approved operator UI origins." })

$swaggerAllow = Get-EnvValue -Values $envValues -Name "NGINX_SWAGGER_ALLOW"
$swaggerRestricted = $swaggerAllow -and $swaggerAllow -ne "all"
$checks = Add-Check -Checks $checks -Name "Swagger allowlist" -Status $(if ($swaggerRestricted) { "PASS" } elseif ($RequireSwaggerAllowlist) { "REVIEW" } else { "SKIPPED" }) -Severity $(if ($RequireSwaggerAllowlist) { "critical" } else { "warning" }) -Message $(if ($swaggerRestricted) { "NGINX_SWAGGER_ALLOW is restricted." } elseif ($RequireSwaggerAllowlist) { "NGINX_SWAGGER_ALLOW must be restricted for this acceptance run." } else { "NGINX_SWAGGER_ALLOW is not restricted; field reviewer must accept internal-only Swagger exposure." })

$wrongwayRateLimit = Get-EnvValue -Values $envValues -Name "NGINX_WRONGWAY_RATE_LIMIT"
$wrongwayBurst = Get-EnvValue -Values $envValues -Name "NGINX_WRONGWAY_BURST"
$wrongwayLimiterReady = $wrongwayRateLimit -and $wrongwayBurst
$checks = Add-Check -Checks $checks -Name "Nginx wrong-way rate limit" -Status $(if ($wrongwayLimiterReady) { "PASS" } else { "REVIEW" }) -Severity "warning" -Message $(if ($wrongwayLimiterReady) { "NGINX_WRONGWAY_RATE_LIMIT and NGINX_WRONGWAY_BURST are configured." } else { "NGINX_WRONGWAY_RATE_LIMIT or NGINX_WRONGWAY_BURST is missing; set values for the expected LiDAR event rate." })

$contentSecurityPolicy = Get-EnvValue -Values $envValues -Name "NGINX_CONTENT_SECURITY_POLICY"
$checks = Add-Check -Checks $checks -Name "Nginx content security policy" -Status $(if ($contentSecurityPolicy) { "PASS" } else { "REVIEW" }) -Severity "warning" -Message $(if ($contentSecurityPolicy) { "NGINX_CONTENT_SECURITY_POLICY is configured." } else { "NGINX_CONTENT_SECURITY_POLICY is missing; review final camera/lidar/media host topology." })

$reviewCount = @($checks | Where-Object { $_.status -eq "REVIEW" }).Count
$skippedCount = @($checks | Where-Object { $_.status -eq "SKIPPED" }).Count
$overallStatus = if ($reviewCount -gt 0) { "REVIEW" } elseif ($skippedCount -gt 0) { "PASS_WITH_SKIPS" } else { "PASS" }
$closeoutChecklist = New-CloseoutChecklist -Checks $checks

$manifest = [pscustomobject]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  baseUrl = $BaseUrl
  reviewer = $Reviewer
  siteName = $SiteName
  git = Get-GitState
  status = $overallStatus
  strict = [bool]$Strict
  allowLiveTcp = [bool]$AllowLiveTcp
  requireDeviceKey = [bool]$RequireDeviceKey
  requireHttpsCookies = [bool]$RequireHttpsCookies
  requireSwaggerAllowlist = [bool]$RequireSwaggerAllowlist
  reviewCount = $reviewCount
  skippedCount = $skippedCount
  closeoutChecklist = $closeoutChecklist
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
  "- Git commit: $($manifest.git.commit)",
  "- Git branch: $($manifest.git.branch)",
  "- Git upstream: $($manifest.git.upstream)",
  "- Git pushed to origin/dev: $($manifest.git.pushed)",
  "- Working tree clean: $($manifest.git.clean)",
  "- Status: $overallStatus",
  "- Strict: $([bool]$Strict)",
  "- Review count: $reviewCount",
  "- Skipped count: $skippedCount",
  "",
  "## Checks",
  "",
  "| Status | Severity | Check | Message | Next Action | Evidence Command | Done When |",
  "| --- | --- | --- | --- | --- | --- | --- |"
) + ($checks | ForEach-Object { "| $($_.status) | $($_.severity) | $($_.name) | $($_.message) | $($_.nextAction) | $($_.evidenceCommand) | $($_.doneWhen) |" }) + @(
  "",
  "## Closeout Checklist",
  "",
  "| Status | Severity | Check | Next Action | Evidence Command | Done When |",
  "| --- | --- | --- | --- | --- | --- |"
) + ($closeoutChecklist | ForEach-Object { "| $($_.status) | $($_.severity) | $($_.name) | $($_.nextAction) | $($_.evidenceCommand) | $($_.doneWhen) |" }) + @("")

$markdownLines | Out-File -LiteralPath (Join-Path $outputDir "manifest.md") -Encoding utf8

Write-Host "field preflight evidence written to $outputDir"
Write-Host "field preflight status: $overallStatus"

if ($Strict -and $overallStatus -ne "PASS") {
  throw "Field preflight completed with ${overallStatus}. See $outputDir for details."
}
