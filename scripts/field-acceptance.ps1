param(
  [string]$BaseUrl = "http://localhost:8080",
  [string]$OutputRoot = "artifacts/field-acceptance",
  [switch]$SkipRuntime,
  [switch]$SkipDb,
  [switch]$SkipLidar,
  [switch]$SkipControlBoard,
  [switch]$SkipSecurity,
  [switch]$RunDbDeploy,
  [switch]$RunDbSeed,
  [switch]$AllowLiveTcp,
  [switch]$IncludeContainerImages,
  [switch]$IncludeZap,
  [switch]$RequireScanners,
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
    & $Script *>&1 | Tee-Object -FilePath $LogFile
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

$outputDir = New-AcceptanceDirectory
$steps = @()

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

$steps += Invoke-AcceptanceStep -Name "delivery evidence package" -Command "npm.cmd run delivery:evidence" -LogFile (Join-Path $outputDir "07-delivery-evidence.log") -Script {
  npm.cmd run delivery:evidence
}

$reviewSteps = @($steps | Where-Object { $_.status -eq "REVIEW" })
$skippedSteps = @($steps | Where-Object { $_.status -eq "SKIPPED" })
$overallStatus = if ($reviewSteps.Count -gt 0) { "REVIEW" } elseif ($skippedSteps.Count -gt 0) { "PASS_WITH_SKIPS" } else { "PASS" }

$manifest = [pscustomobject]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  baseUrl = $BaseUrl
  outputDir = $outputDir
  status = $overallStatus
  safety = @{
    runDbDeploy = [bool]$RunDbDeploy
    runDbSeed = [bool]$RunDbSeed
    allowLiveTcp = [bool]$AllowLiveTcp
    includeContainerImages = [bool]$IncludeContainerImages
    includeZap = [bool]$IncludeZap
    requireScanners = [bool]$RequireScanners
    startCompose = [bool]$StartCompose
    stopCompose = [bool]$StopCompose
  }
  steps = $steps
}

$manifest | ConvertTo-Json -Depth 20 | Out-File -LiteralPath (Join-Path $outputDir "manifest.json") -Encoding utf8

$markdownLines = @(
  "# Field Acceptance Orchestrator",
  "",
  "- Generated at: $($manifest.generatedAt)",
  "- Base URL: $BaseUrl",
  "- Status: $overallStatus",
  "- Output directory: $outputDir",
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
  "| StartCompose | $([bool]$StartCompose) |",
  "| StopCompose | $([bool]$StopCompose) |",
  "",
  "## Steps",
  "",
  "| Status | Step | Command | Log |",
  "| --- | --- | --- | --- |"
) + ($steps | ForEach-Object {
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

Write-Host "field acceptance evidence written to $outputDir"
Write-Host "field acceptance status: $overallStatus"

if ($reviewSteps.Count -gt 0) {
  throw "Field acceptance completed with REVIEW items. See $outputDir for logs."
}
