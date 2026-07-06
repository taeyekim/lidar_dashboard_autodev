param(
  [switch]$IncludeRuntime,
  [switch]$StartCompose,
  [switch]$StopCompose,
  [string]$BaseUrl = $(if ($env:FIELD_BASE_URL) { $env:FIELD_BASE_URL } else { "http://localhost:8080" })
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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

Invoke-Step "delivery verify" { npm.cmd run delivery:verify }

if ($IncludeRuntime) {
  $argsList = @("-File", "scripts/runtime-smoke.ps1", "-BaseUrl", $BaseUrl)
  if ($StartCompose) { $argsList += "-StartCompose" }
  if ($StopCompose) { $argsList += "-StopCompose" }
  Invoke-Step "runtime smoke" { powershell.exe -NoProfile -ExecutionPolicy Bypass @argsList }
}

Write-Host "delivery verification ok"
