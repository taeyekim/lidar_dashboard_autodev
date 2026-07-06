param(
  [string]$TargetUrl = $(if ($env:FIELD_BASE_URL) { $env:FIELD_BASE_URL } else { "http://localhost:8080" }),
  [switch]$IncludeContainerImages,
  [switch]$IncludeZap,
  [switch]$RequireScanners,
  [string]$OutputRoot = "artifacts/security"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function New-ScanDirectory {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $path = Join-Path $OutputRoot $stamp
  New-Item -ItemType Directory -Force -Path $path | Out-Null
  return $path
}

function Test-CommandExists {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Add-Skip {
  param(
    [string]$FilePath,
    [string]$Name,
    [string]$Reason,
    [switch]$Required
  )

  Add-Content -LiteralPath $FilePath -Value "- ${Name}: 미검증 - ${Reason}"
  if ($Required) {
    throw "${Name} is required but skipped: ${Reason}"
  }
}

function Invoke-RecordedCommand {
  param(
    [string]$Name,
    [string]$FilePath,
    [scriptblock]$Command,
    [switch]$Required
  )

  Add-Content -LiteralPath $FilePath -Value "## ${Name}`n"
  try {
    & $Command *>&1 | Tee-Object -FilePath $FilePath -Append
    $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
    Add-Content -LiteralPath $FilePath -Value "`nexit_code=${exitCode}`n"
    if ($Required -and $exitCode -ne 0) {
      throw "${Name} failed with exit code ${exitCode}"
    }
  } catch {
    Add-Content -LiteralPath $FilePath -Value "`nerror=$($_.Exception.Message)`n"
    if ($Required) { throw }
  }
}

$scanDir = New-ScanDirectory
$summaryPath = Join-Path $scanDir "summary.md"
$skippedPath = Join-Path $scanDir "skipped-checks.md"
$commandsPath = Join-Path $scanDir "commands.log"

Set-Content -LiteralPath $summaryPath -Value "# Security Scan Evidence`n`n- Date: $(Get-Date -Format o)`n- Target URL: ${TargetUrl}`n"
Set-Content -LiteralPath $skippedPath -Value "# Skipped Checks`n"
Set-Content -LiteralPath $commandsPath -Value "# Command Output`n"

Invoke-RecordedCommand -Name "npm audit raw json" -FilePath $commandsPath -Command {
  npm.cmd audit --workspaces --json
}

Invoke-RecordedCommand -Name "npm audit policy gate" -FilePath $commandsPath -Required -Command {
  npm.cmd run verify:audit-policy
}

if (Test-CommandExists "gitleaks") {
  Invoke-RecordedCommand -Name "gitleaks secret scan" -FilePath $commandsPath -Command {
    gitleaks detect --source . --redact --report-format json --report-path (Join-Path $scanDir "gitleaks.json")
  }
} else {
  Add-Skip -FilePath $skippedPath -Name "gitleaks" -Reason "gitleaks command not installed on this PC" -Required:$RequireScanners
}

if (Test-CommandExists "trivy") {
  Invoke-RecordedCommand -Name "trivy filesystem scan" -FilePath $commandsPath -Command {
    trivy fs --scanners vuln,secret,misconfig --format json --output (Join-Path $scanDir "trivy-fs.json") .
  }

  if ($IncludeContainerImages) {
    Invoke-RecordedCommand -Name "trivy backend image scan" -FilePath $commandsPath -Command {
      trivy image --format json --output (Join-Path $scanDir "trivy-backend-image.json") lidar_dashboard_autodev-backend
    }
    Invoke-RecordedCommand -Name "trivy frontend image scan" -FilePath $commandsPath -Command {
      trivy image --format json --output (Join-Path $scanDir "trivy-frontend-image.json") lidar_dashboard_autodev-frontend
    }
  } else {
    Add-Skip -FilePath $skippedPath -Name "trivy image" -Reason "IncludeContainerImages switch was not provided" -Required:$RequireScanners
  }
} else {
  Add-Skip -FilePath $skippedPath -Name "trivy" -Reason "trivy command not installed on this PC" -Required:$RequireScanners
}

if ($IncludeZap) {
  if (Test-CommandExists "zap-baseline.py") {
    Invoke-RecordedCommand -Name "OWASP ZAP baseline" -FilePath $commandsPath -Command {
      zap-baseline.py -t $TargetUrl -r (Join-Path $scanDir "zap-baseline.html")
    }
  } else {
    Add-Skip -FilePath $skippedPath -Name "zap-baseline.py" -Reason "OWASP ZAP baseline command not installed on this PC" -Required:$RequireScanners
  }
} else {
  Add-Skip -FilePath $skippedPath -Name "OWASP ZAP baseline" -Reason "IncludeZap switch was not provided" -Required:$RequireScanners
}

Add-Content -LiteralPath $summaryPath -Value "- Raw command log: commands.log`n- Skipped checks: skipped-checks.md`n"
Write-Host "security scan evidence written to $scanDir"
