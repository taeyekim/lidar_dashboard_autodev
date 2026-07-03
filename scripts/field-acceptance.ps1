param(
  [string]$BaseUrl = "http://localhost:8080",
  [string]$OutputRoot = "artifacts/field-acceptance",
  [string]$Reviewer = "",
  [string]$SiteName = "",
  [string]$DecisionNote = "",
  [string]$OperatorUiWalkthroughEvidence = "",
  [switch]$SkipRuntime,
  [switch]$SkipDb,
  [switch]$SkipLidar,
  [switch]$SkipControlBoard,
  [switch]$SkipSecurity,
  [switch]$SkipOperatorUiWalkthrough,
  [switch]$RunDbDeploy,
  [switch]$RunDbSeed,
  [switch]$AllowLiveTcp,
  [switch]$IncludeContainerImages,
  [switch]$IncludeZap,
  [switch]$RequireScanners,
  [switch]$RequireDeviceKey,
  [switch]$RequireHttpsCookies,
  [switch]$RequireSwaggerAllowlist,
  [switch]$StrictPreflight,
  [switch]$StartCompose,
  [switch]$StopCompose
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Contract anchor: scripts/field-acceptance.ps1 writes the top-level ordered
# field acceptance evidence package.

function New-AcceptanceDirectory {
  $stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
  $path = Join-Path $OutputRoot $stamp
  New-Item -ItemType Directory -Force -Path $path | Out-Null
  return $path
}

function New-StepResult {
  param(
    [string]$Name,
    [string]$Status,
    [string]$Command,
    [string]$LogPath,
    [int]$ExitCode,
    [string]$StartedAt,
    [string]$FinishedAt,
    [string]$Reason = ""
  )

  return [pscustomobject]@{
    name = $Name
    status = $Status
    command = $Command
    logPath = $LogPath
    exitCode = $ExitCode
    startedAt = $StartedAt
    finishedAt = $FinishedAt
    reason = $Reason
  }
}

function Invoke-AcceptanceStep {
  param(
    [string]$Name,
    [string]$Command,
    [string]$LogFile,
    [scriptblock]$Script
  )

  Write-Host "==> $Name"
  $startedAt = (Get-Date).ToUniversalTime().ToString("o")
  $exitCode = 0
  try {
    & $Script *>&1 | Tee-Object -FilePath $LogFile | Out-Null
    $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
  } catch {
    $_ | Out-String | Tee-Object -FilePath $LogFile | Out-Null
    $exitCode = 1
  }

  $finishedAt = (Get-Date).ToUniversalTime().ToString("o")
  if ($exitCode -eq 0) {
    return New-StepResult -Name $Name -Status "PASS" -Command $Command -LogPath $LogFile -ExitCode $exitCode -StartedAt $startedAt -FinishedAt $finishedAt
  }

  return New-StepResult -Name $Name -Status "REVIEW" -Command $Command -LogPath $LogFile -ExitCode $exitCode -StartedAt $startedAt -FinishedAt $finishedAt -Reason "Command exited non-zero; review the captured log."
}

function Add-SkippedStep {
  param(
    [string]$Name,
    [string]$Reason
  )

  $now = (Get-Date).ToUniversalTime().ToString("o")
  return New-StepResult -Name $Name -Status "SKIPPED" -Command "" -LogPath "" -ExitCode 0 -StartedAt $now -FinishedAt $now -Reason $Reason
}

function Test-PlaceholderFieldText {
  param([string]$Value)

  return [regex]::IsMatch(
    [string]$Value,
    "^(?:-|n/a|na|none|null|tbd|todo|pending|unknown|unspecified|field-reviewer|field-reviewer-name|field-site|delivery-site-name)$",
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
  )
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

function Get-MarkdownTableValue {
  param(
    [string]$Content,
    [string]$Field
  )

  $escapedField = [regex]::Escape($Field)
  $match = [regex]::Match($Content, "\|\s*$escapedField\s*\|\s*([^|\r\n]+?)\s*\|")
  if (!$match.Success) { return "" }
  return $match.Groups[1].Value.Trim()
}

function Add-OperatorUiWalkthroughGate {
  $now = (Get-Date).ToUniversalTime().ToString("o")
  if ($SkipOperatorUiWalkthrough) {
    return New-StepResult -Name "operator UI browser walkthrough" -Status "SKIPPED" -Command "" -LogPath "" -ExitCode 0 -StartedAt $now -FinishedAt $now -Reason "SkipOperatorUiWalkthrough switch was provided; delivery display browser walkthrough evidence must be accepted by the field reviewer."
  }

  if ([string]::IsNullOrWhiteSpace($OperatorUiWalkthroughEvidence)) {
    return New-StepResult -Name "operator UI browser walkthrough" -Status "REVIEW" -Command "attach browser walkthrough evidence with -OperatorUiWalkthroughEvidence <path>" -LogPath "" -ExitCode 1 -StartedAt $now -FinishedAt $now -Reason "Browser walkthrough evidence for the delivery display resolution was not attached. Capture login, dashboard status, DRY_RUN/LIVE_TCP state, liveApproved, LIVE_TCP_APPROVAL_REQUIRED if applicable, event detail, Devices, Event Log realtime/degraded state, and Swagger entrypoint."
  }

  if (!(Test-Path -LiteralPath $OperatorUiWalkthroughEvidence)) {
    return New-StepResult -Name "operator UI browser walkthrough" -Status "REVIEW" -Command "read $OperatorUiWalkthroughEvidence" -LogPath "" -ExitCode 1 -StartedAt $now -FinishedAt $now -Reason "Operator UI walkthrough evidence path was provided but does not exist."
  }

  $evidence = Get-Content -LiteralPath $OperatorUiWalkthroughEvidence -Raw
  $requiredTokens = @(
    "## Required Screens",
    "Login",
    "Dashboard",
    "Control-board mode",
    "liveApproved",
    "LIVE_TCP_APPROVAL_REQUIRED",
    "Event detail",
    "Devices",
    "Event Log",
    "Statistics",
    "Swagger",
    "## Reviewer Decision",
    "Walkthrough result"
  )
  $missingTokens = @($requiredTokens | Where-Object { $evidence -notlike "*$_*" })
  if ($missingTokens.Count -gt 0) {
    return New-StepResult -Name "operator UI browser walkthrough" -Status "REVIEW" -Command "validate $OperatorUiWalkthroughEvidence" -LogPath $OperatorUiWalkthroughEvidence -ExitCode 1 -StartedAt $now -FinishedAt $now -Reason "Operator UI walkthrough evidence is missing required section/token(s): $($missingTokens -join ', ')."
  }

  $requiredSessionFields = @(
    "Site name",
    "Reviewer",
    "Operator account",
    "Browser and version",
    "Delivery display resolution",
    "Entry URL",
    "Base API URL",
    "Captured at"
  )
  foreach ($field in $requiredSessionFields) {
    $value = Get-MarkdownTableValue -Content $evidence -Field $field
    if ([string]::IsNullOrWhiteSpace($value)) {
      return New-StepResult -Name "operator UI browser walkthrough" -Status "REVIEW" -Command "validate $OperatorUiWalkthroughEvidence" -LogPath $OperatorUiWalkthroughEvidence -ExitCode 1 -StartedAt $now -FinishedAt $now -Reason "Operator UI walkthrough evidence has an empty '$field' session value."
    }
    if (Test-PlaceholderFieldText -Value $value) {
      return New-StepResult -Name "operator UI browser walkthrough" -Status "REVIEW" -Command "validate $OperatorUiWalkthroughEvidence" -LogPath $OperatorUiWalkthroughEvidence -ExitCode 1 -StartedAt $now -FinishedAt $now -Reason "Operator UI walkthrough evidence has a placeholder '$field' session value."
    }
  }

  if ($evidence -match "\|\s*TODO\s*\|") {
    return New-StepResult -Name "operator UI browser walkthrough" -Status "REVIEW" -Command "validate $OperatorUiWalkthroughEvidence" -LogPath $OperatorUiWalkthroughEvidence -ExitCode 1 -StartedAt $now -FinishedAt $now -Reason "Operator UI walkthrough evidence still contains TODO screen rows; complete each required screen row before final field acceptance."
  }

  if ($evidence -notmatch "\|\s*Walkthrough result\s*\|\s*PASS\s*\|") {
    return New-StepResult -Name "operator UI browser walkthrough" -Status "REVIEW" -Command "validate $OperatorUiWalkthroughEvidence" -LogPath $OperatorUiWalkthroughEvidence -ExitCode 1 -StartedAt $now -FinishedAt $now -Reason "Operator UI walkthrough evidence must record '| Walkthrough result | PASS |' before final field acceptance."
  }

  $requiredDecisionFields = @(
    "Reviewer signature/name",
    "Decision timestamp"
  )
  foreach ($field in $requiredDecisionFields) {
    $value = Get-MarkdownTableValue -Content $evidence -Field $field
    if ([string]::IsNullOrWhiteSpace($value)) {
      return New-StepResult -Name "operator UI browser walkthrough" -Status "REVIEW" -Command "validate $OperatorUiWalkthroughEvidence" -LogPath $OperatorUiWalkthroughEvidence -ExitCode 1 -StartedAt $now -FinishedAt $now -Reason "Operator UI walkthrough evidence has an empty '$field' decision value."
    }
    if (Test-PlaceholderFieldText -Value $value) {
      return New-StepResult -Name "operator UI browser walkthrough" -Status "REVIEW" -Command "validate $OperatorUiWalkthroughEvidence" -LogPath $OperatorUiWalkthroughEvidence -ExitCode 1 -StartedAt $now -FinishedAt $now -Reason "Operator UI walkthrough evidence has a placeholder '$field' decision value."
    }
  }

  return New-StepResult -Name "operator UI browser walkthrough" -Status "PASS" -Command "read $OperatorUiWalkthroughEvidence" -LogPath $OperatorUiWalkthroughEvidence -ExitCode 0 -StartedAt $now -FinishedAt $now
}

function Get-LatestManifest {
  param([string]$Root)

  if (!(Test-Path -LiteralPath $Root)) { return $null }
  $manifest = Get-ChildItem -LiteralPath $Root -Directory |
    Sort-Object Name -Descending |
    Select-Object -First 1 |
    ForEach-Object { Join-Path $_.FullName "manifest.json" }
  if (!$manifest -or !(Test-Path -LiteralPath $manifest)) { return $null }
  return Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
}

function Get-LatestManifestPath {
  param([string]$Root)

  if (!(Test-Path -LiteralPath $Root)) { return $null }
  $manifest = Get-ChildItem -LiteralPath $Root -Directory |
    Sort-Object Name -Descending |
    Select-Object -First 1 |
    ForEach-Object { Join-Path $_.FullName "manifest.json" }
  if (!$manifest -or !(Test-Path -LiteralPath $manifest)) { return $null }
  return $manifest
}

function Add-PreflightManifestGate {
  param([object[]]$Steps)

  $manifest = Get-LatestManifest -Root "artifacts/field-preflight"
  $now = (Get-Date).ToUniversalTime().ToString("o")
  if ($null -eq $manifest) {
    return $Steps + (New-StepResult -Name "field preflight manifest gate" -Status "REVIEW" -Command "read artifacts/field-preflight/latest/manifest.json" -LogPath "" -ExitCode 1 -StartedAt $now -FinishedAt $now -Reason "Latest field preflight manifest was not found.")
  }

  if ($manifest.status -eq "PASS") { return $Steps }

  $status = if ($manifest.status -eq "PASS_WITH_SKIPS") { "SKIPPED" } else { "REVIEW" }
  $exitCode = if ($status -eq "SKIPPED") { 0 } else { 1 }
  return $Steps + (New-StepResult -Name "field preflight manifest gate" -Status $status -Command "read artifacts/field-preflight/latest/manifest.json" -LogPath "" -ExitCode $exitCode -StartedAt $now -FinishedAt $now -Reason "Latest field preflight manifest status is $($manifest.status); reviewCount=$($manifest.reviewCount), skippedCount=$($manifest.skippedCount).")
}

function Add-ArgumentIf {
  param(
    [string[]]$Arguments,
    [bool]$Condition,
    [string]$Argument
  )

  if ($Condition) {
    return $Arguments + $Argument
  }
  return $Arguments
}

function ConvertTo-StepList {
  param([object[]]$Steps)

  $items = New-Object System.Collections.ArrayList
  foreach ($item in $Steps) {
    if ($null -eq $item) { continue }
    if ($item -is [System.Array]) {
      foreach ($nested in $item) {
        if ($null -ne $nested) {
          [void]$items.Add($nested)
        }
      }
    } else {
      [void]$items.Add($item)
    }
  }
  return $items.ToArray()
}

function Get-StepsByStatus {
  param(
    [object[]]$Steps,
    [string]$Status
  )

  $stepList = ConvertTo-StepList -Steps $Steps
  return @($stepList | Where-Object {
    $statusProperty = $_.PSObject.Properties["status"]
    $null -ne $statusProperty -and $statusProperty.Value -eq $Status
  })
}

function New-AcceptanceManifest {
  param(
    [string]$Status,
    [object[]]$Steps
  )

  $stepList = ConvertTo-StepList -Steps $Steps
  $reviewSteps = @(Get-StepsByStatus -Steps $stepList -Status "REVIEW")
  $skippedSteps = @(Get-StepsByStatus -Steps $stepList -Status "SKIPPED")
  $hasReviewer = ![string]::IsNullOrWhiteSpace($Reviewer) -and !(Test-PlaceholderFieldText -Value $Reviewer)
  $hasSiteName = ![string]::IsNullOrWhiteSpace($SiteName) -and !(Test-PlaceholderFieldText -Value $SiteName)
  $latestPreflightManifest = Get-LatestManifest -Root "artifacts/field-preflight"
  $latestPreflightStatus = if ($null -eq $latestPreflightManifest) { "MISSING" } else { $latestPreflightManifest.status }
  $latestPreflightPassed = $latestPreflightStatus -eq "PASS"
  $readyForHandover = $Status -eq "PASS" -and $latestPreflightPassed -and $hasReviewer -and $hasSiteName
  $requiresFieldReview = $Status -eq "REVIEW" -or $Status -eq "IN_PROGRESS" -or $skippedSteps.Count -gt 0 -or !$latestPreflightPassed -or !$hasReviewer -or !$hasSiteName
  $nextActions = @()
  if ($Status -eq "IN_PROGRESS") {
    $nextActions += "Wait for the field acceptance orchestrator to complete and confirm the final manifest status."
  }
  if ($reviewSteps.Count -gt 0) {
    $nextActions += "Review failed step logs and rerun the field acceptance orchestrator after correction."
  }
  if ($skippedSteps.Count -gt 0) {
    $nextActions += "Confirm each skipped step is accepted by the field reviewer or rerun without skip switches."
  }
  if (!$latestPreflightPassed) {
    $nextActions += "Rerun field preflight until the latest preflight manifest status is PASS before final handover."
  }
  if (!$hasReviewer) {
    $nextActions += "Record the field reviewer name with -Reviewer before attaching the evidence package."
  }
  if (!$hasSiteName) {
    $nextActions += "Record the delivery site name with -SiteName before final handover."
  }
  if ($nextActions.Count -eq 0) {
    $nextActions += "Attach this manifest, delivery evidence, and raw logs to the handover package."
  }

  return [pscustomobject]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    baseUrl = $BaseUrl
    outputDir = $outputDir
    git = Get-GitState
    status = $Status
    handover = @{
      readyForHandover = $readyForHandover
      requiresFieldReview = $requiresFieldReview
      reviewer = $Reviewer
      siteName = $SiteName
      decisionNote = $DecisionNote
      hostName = $env:COMPUTERNAME
      operatorUser = $env:USERNAME
      latestPreflightStatus = $latestPreflightStatus
      latestPreflightPassed = $latestPreflightPassed
      reviewStepCount = $reviewSteps.Count
      skippedStepCount = $skippedSteps.Count
      nextActions = $nextActions
    }
    safety = @{
      runDbDeploy = [bool]$RunDbDeploy
      runDbSeed = [bool]$RunDbSeed
      allowLiveTcp = [bool]$AllowLiveTcp
      includeContainerImages = [bool]$IncludeContainerImages
      includeZap = [bool]$IncludeZap
      requireScanners = [bool]$RequireScanners
      requireDeviceKey = [bool]$RequireDeviceKey
      requireHttpsCookies = [bool]$RequireHttpsCookies
      requireSwaggerAllowlist = [bool]$RequireSwaggerAllowlist
      strictPreflight = [bool]$StrictPreflight
      startCompose = [bool]$StartCompose
      stopCompose = [bool]$StopCompose
      skipOperatorUiWalkthrough = [bool]$SkipOperatorUiWalkthrough
      operatorUiWalkthroughEvidence = $OperatorUiWalkthroughEvidence
    }
    evidenceRefs = @{
      fieldPreflight = Get-LatestManifestPath -Root "artifacts/field-preflight"
      runtime = Get-LatestManifestPath -Root "artifacts/runtime"
      database = Get-LatestManifestPath -Root "artifacts/field-db-rehearsal"
      lidar = Get-LatestManifestPath -Root "artifacts/field-lidar-rehearsal"
      controlBoard = Get-LatestManifestPath -Root "artifacts/field-control-board-rehearsal"
      security = Get-LatestManifestPath -Root "artifacts/security"
      delivery = Get-LatestManifestPath -Root "artifacts/delivery"
    }
    steps = $stepList
  }
}

function Write-AcceptanceManifest {
  param(
    [string]$Status,
    [object[]]$Steps
  )

  $stepList = ConvertTo-StepList -Steps $Steps
  $reviewSteps = @(Get-StepsByStatus -Steps $stepList -Status "REVIEW")
  $skippedSteps = @(Get-StepsByStatus -Steps $stepList -Status "SKIPPED")
  $manifest = New-AcceptanceManifest -Status $Status -Steps $stepList

  $manifest | ConvertTo-Json -Depth 20 | Out-File -LiteralPath (Join-Path $outputDir "manifest.json") -Encoding utf8

  $markdownLines = @(
    "# Field Acceptance Orchestrator",
    "",
    "- Generated at: $($manifest.generatedAt)",
    "- Base URL: $BaseUrl",
    "- Status: $Status",
    "- Output directory: $outputDir",
    "- Git commit: $($manifest.git.commit)",
    "- Git branch: $($manifest.git.branch)",
    "- Git upstream: $($manifest.git.upstream)",
    "- Git upstream commit: $($manifest.git.upstreamCommit)",
    "- Git pushed to origin/dev: $($manifest.git.pushed)",
    "- Working tree clean: $($manifest.git.clean)",
    "- Reviewer: $($manifest.handover.reviewer)",
    "- Site name: $($manifest.handover.siteName)",
    "- Ready for handover: $($manifest.handover.readyForHandover)",
    "- Requires field review: $($manifest.handover.requiresFieldReview)",
    "",
    "## Field Acceptance Decision",
    "",
    "| Item | Value |",
    "| --- | --- |",
    "| Reviewer | $($manifest.handover.reviewer) |",
    "| Site name | $($manifest.handover.siteName) |",
    "| Operator user | $($manifest.handover.operatorUser) |",
    "| Host name | $($manifest.handover.hostName) |",
    "| Decision note | $($manifest.handover.decisionNote) |",
    "| Latest preflight status | $($manifest.handover.latestPreflightStatus) |",
    "| Latest preflight passed | $($manifest.handover.latestPreflightPassed) |",
    "| Review steps | $($manifest.handover.reviewStepCount) |",
    "| Skipped steps | $($manifest.handover.skippedStepCount) |",
    "| Ready for handover | $($manifest.handover.readyForHandover) |",
    "| Requires field review | $($manifest.handover.requiresFieldReview) |",
    "",
    "Next actions:",
    "",
    ($manifest.handover.nextActions | ForEach-Object { "- $_" }),
    "",
    "## Safety Switches",
    "",
    "| Switch | Enabled |",
    "| --- | --- |",
    "| RunDbDeploy | $([bool]$RunDbDeploy) |",
    "| RunDbSeed | $([bool]$RunDbSeed) |",
    "| AllowLiveTcp | $([bool]$AllowLiveTcp) |",
    "| IncludeContainerImages | $([bool]$IncludeContainerImages) |",
    "| IncludeZap | $([bool]$IncludeZap) |",
    "| RequireScanners | $([bool]$RequireScanners) |",
    "| RequireDeviceKey | $([bool]$RequireDeviceKey) |",
    "| RequireHttpsCookies | $([bool]$RequireHttpsCookies) |",
    "| RequireSwaggerAllowlist | $([bool]$RequireSwaggerAllowlist) |",
    "| StrictPreflight | $([bool]$StrictPreflight) |",
    "| StartCompose | $([bool]$StartCompose) |",
    "| StopCompose | $([bool]$StopCompose) |",
    "| SkipOperatorUiWalkthrough | $([bool]$SkipOperatorUiWalkthrough) |",
    "| OperatorUiWalkthroughEvidence | $OperatorUiWalkthroughEvidence |",
    "",
    "## Evidence References",
    "",
    "| Evidence | Manifest |",
    "| --- | --- |",
    "| Field preflight | $($manifest.evidenceRefs.fieldPreflight) |",
    "| Runtime | $($manifest.evidenceRefs.runtime) |",
    "| DB and Prisma | $($manifest.evidenceRefs.database) |",
    "| LiDAR ingest | $($manifest.evidenceRefs.lidar) |",
    "| Control-board TCP | $($manifest.evidenceRefs.controlBoard) |",
    "| Security | $($manifest.evidenceRefs.security) |",
    "| Delivery | $($manifest.evidenceRefs.delivery) |",
    "",
    "## Steps",
    "",
    "| Status | Step | Command | Log |",
    "| --- | --- | --- | --- |"
  ) + ($stepList | ForEach-Object {
    "| $($_.status) | $($_.name) | ``$($_.command)`` | $($_.logPath) |"
  }) + @(
    "",
    "## Review Notes",
    ""
  ) + ($(if ($reviewSteps.Count -gt 0) {
    $reviewSteps | ForEach-Object { "- REVIEW: $($_.name) - $($_.reason)" }
  } else {
    "- No REVIEW steps."
  })) + ($(if ($skippedSteps.Count -gt 0) {
    @("", "## Skipped Steps", "") + ($skippedSteps | ForEach-Object { "- SKIPPED: $($_.name) - $($_.reason)" })
  } else {
    @("")
  }))

  $markdownLines | Out-File -LiteralPath (Join-Path $outputDir "manifest.md") -Encoding utf8
  return $manifest
}

$outputDir = New-AcceptanceDirectory
$steps = @()

$preflightArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/field-preflight.ps1", "-BaseUrl", $BaseUrl, "-Reviewer", $Reviewer, "-SiteName", $SiteName)
$preflightCommandParts = @("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/field-preflight.ps1", "-BaseUrl", $BaseUrl, "-Reviewer", $Reviewer, "-SiteName", $SiteName)
$preflightArgs = Add-ArgumentIf -Arguments $preflightArgs -Condition ([bool]$AllowLiveTcp) -Argument "-AllowLiveTcp"
$preflightArgs = Add-ArgumentIf -Arguments $preflightArgs -Condition ([bool]$RequireDeviceKey) -Argument "-RequireDeviceKey"
$preflightArgs = Add-ArgumentIf -Arguments $preflightArgs -Condition ([bool]$RequireHttpsCookies) -Argument "-RequireHttpsCookies"
$preflightArgs = Add-ArgumentIf -Arguments $preflightArgs -Condition ([bool]$RequireSwaggerAllowlist) -Argument "-RequireSwaggerAllowlist"
$preflightArgs = Add-ArgumentIf -Arguments $preflightArgs -Condition ([bool]$StrictPreflight) -Argument "-Strict"
$preflightCommandParts = Add-ArgumentIf -Arguments $preflightCommandParts -Condition ([bool]$AllowLiveTcp) -Argument "-AllowLiveTcp"
$preflightCommandParts = Add-ArgumentIf -Arguments $preflightCommandParts -Condition ([bool]$RequireDeviceKey) -Argument "-RequireDeviceKey"
$preflightCommandParts = Add-ArgumentIf -Arguments $preflightCommandParts -Condition ([bool]$RequireHttpsCookies) -Argument "-RequireHttpsCookies"
$preflightCommandParts = Add-ArgumentIf -Arguments $preflightCommandParts -Condition ([bool]$RequireSwaggerAllowlist) -Argument "-RequireSwaggerAllowlist"
$preflightCommandParts = Add-ArgumentIf -Arguments $preflightCommandParts -Condition ([bool]$StrictPreflight) -Argument "-Strict"
$steps += Invoke-AcceptanceStep -Name "field preflight" -Command ($preflightCommandParts -join " ") -LogFile (Join-Path $outputDir "00-field-preflight.log") -Script {
  powershell.exe @preflightArgs
}
$steps = Add-PreflightManifestGate -Steps $steps

$steps += Invoke-AcceptanceStep -Name "delivery verify gate" -Command "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/delivery-verify.ps1" -LogFile (Join-Path $outputDir "01-delivery-verify.log") -Script {
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "scripts/delivery-verify.ps1"
}

if ($SkipRuntime) {
  $steps += Add-SkippedStep -Name "runtime smoke" -Reason "SkipRuntime switch was provided."
} else {
  $runtimeArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/runtime-smoke.ps1", "-BaseUrl", $BaseUrl)
  $runtimeCommandParts = @("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/runtime-smoke.ps1", "-BaseUrl", $BaseUrl)
  $runtimeArgs = Add-ArgumentIf -Arguments $runtimeArgs -Condition ([bool]$StartCompose) -Argument "-StartCompose"
  $runtimeArgs = Add-ArgumentIf -Arguments $runtimeArgs -Condition ([bool]$StopCompose) -Argument "-StopCompose"
  $runtimeCommandParts = Add-ArgumentIf -Arguments $runtimeCommandParts -Condition ([bool]$StartCompose) -Argument "-StartCompose"
  $runtimeCommandParts = Add-ArgumentIf -Arguments $runtimeCommandParts -Condition ([bool]$StopCompose) -Argument "-StopCompose"
  $steps += Invoke-AcceptanceStep -Name "runtime smoke" -Command ($runtimeCommandParts -join " ") -LogFile (Join-Path $outputDir "02-runtime-smoke.log") -Script {
    powershell.exe @runtimeArgs
  }
}

if ($SkipDb) {
  $steps += Add-SkippedStep -Name "DB Prisma field rehearsal" -Reason "SkipDb switch was provided."
} else {
  $dbArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/db-field-rehearsal.ps1", "-BaseUrl", $BaseUrl)
  $dbCommandParts = @("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/db-field-rehearsal.ps1", "-BaseUrl", $BaseUrl)
  $dbArgs = Add-ArgumentIf -Arguments $dbArgs -Condition ([bool]$RunDbDeploy) -Argument "-RunDeploy"
  $dbArgs = Add-ArgumentIf -Arguments $dbArgs -Condition ([bool]$RunDbSeed) -Argument "-RunSeed"
  $dbCommandParts = Add-ArgumentIf -Arguments $dbCommandParts -Condition ([bool]$RunDbDeploy) -Argument "-RunDeploy"
  $dbCommandParts = Add-ArgumentIf -Arguments $dbCommandParts -Condition ([bool]$RunDbSeed) -Argument "-RunSeed"
  $steps += Invoke-AcceptanceStep -Name "DB Prisma field rehearsal" -Command ($dbCommandParts -join " ") -LogFile (Join-Path $outputDir "03-db-field-rehearsal.log") -Script {
    powershell.exe @dbArgs
  }
}

if ($SkipLidar) {
  $steps += Add-SkippedStep -Name "lidar ingest field rehearsal" -Reason "SkipLidar switch was provided."
} else {
  $lidarArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/lidar-ingest-rehearsal.ps1", "-BaseUrl", $BaseUrl)
  $steps += Invoke-AcceptanceStep -Name "lidar ingest field rehearsal" -Command "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/lidar-ingest-rehearsal.ps1 -BaseUrl $BaseUrl" -LogFile (Join-Path $outputDir "04-lidar-ingest-rehearsal.log") -Script {
    powershell.exe @lidarArgs
  }
}

if ($SkipControlBoard) {
  $steps += Add-SkippedStep -Name "control-board field rehearsal" -Reason "SkipControlBoard switch was provided."
} else {
  $controlArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/control-board-field-rehearsal.ps1", "-BaseUrl", $BaseUrl)
  $controlCommandParts = @("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/control-board-field-rehearsal.ps1", "-BaseUrl", $BaseUrl)
  $controlArgs = Add-ArgumentIf -Arguments $controlArgs -Condition ([bool]$AllowLiveTcp) -Argument "-AllowLiveTcp"
  $controlCommandParts = Add-ArgumentIf -Arguments $controlCommandParts -Condition ([bool]$AllowLiveTcp) -Argument "-AllowLiveTcp"
  $steps += Invoke-AcceptanceStep -Name "control-board field rehearsal" -Command ($controlCommandParts -join " ") -LogFile (Join-Path $outputDir "05-control-board-field-rehearsal.log") -Script {
    powershell.exe @controlArgs
  }
}

if ($SkipSecurity) {
  $steps += Add-SkippedStep -Name "security evidence" -Reason "SkipSecurity switch was provided."
} else {
  $securityArgs = @("run", "security:evidence", "--", "--target-url=$BaseUrl")
  $securityCommandParts = @("npm.cmd", "run", "security:evidence", "--", "--target-url=$BaseUrl")
  $securityArgs = Add-ArgumentIf -Arguments $securityArgs -Condition ([bool]$IncludeContainerImages) -Argument "--include-container-images"
  $securityArgs = Add-ArgumentIf -Arguments $securityArgs -Condition ([bool]$IncludeZap) -Argument "--include-zap"
  $securityArgs = Add-ArgumentIf -Arguments $securityArgs -Condition ([bool]$RequireScanners) -Argument "--require-scanners"
  $securityCommandParts = Add-ArgumentIf -Arguments $securityCommandParts -Condition ([bool]$IncludeContainerImages) -Argument "--include-container-images"
  $securityCommandParts = Add-ArgumentIf -Arguments $securityCommandParts -Condition ([bool]$IncludeZap) -Argument "--include-zap"
  $securityCommandParts = Add-ArgumentIf -Arguments $securityCommandParts -Condition ([bool]$RequireScanners) -Argument "--require-scanners"
  $steps += Invoke-AcceptanceStep -Name "security evidence" -Command ($securityCommandParts -join " ") -LogFile (Join-Path $outputDir "06-security-evidence.log") -Script {
    npm.cmd @securityArgs
  }
}

$steps += Add-OperatorUiWalkthroughGate

Write-AcceptanceManifest -Status "IN_PROGRESS" -Steps $steps | Out-Null

$steps += Invoke-AcceptanceStep -Name "delivery evidence package" -Command "npm.cmd run delivery:evidence" -LogFile (Join-Path $outputDir "07-delivery-evidence.log") -Script {
  npm.cmd run delivery:evidence
}

$reviewSteps = @(Get-StepsByStatus -Steps $steps -Status "REVIEW")
$skippedSteps = @(Get-StepsByStatus -Steps $steps -Status "SKIPPED")
$overallStatus = if ($reviewSteps.Count -gt 0) { "REVIEW" } elseif ($skippedSteps.Count -gt 0) { "PASS_WITH_SKIPS" } else { "PASS" }

Write-AcceptanceManifest -Status $overallStatus -Steps $steps | Out-Null

Write-Host "field acceptance evidence written to $outputDir"
Write-Host "field acceptance status: $overallStatus"

if ($reviewSteps.Count -gt 0) {
  throw "Field acceptance completed with REVIEW items. See $outputDir for logs."
}
