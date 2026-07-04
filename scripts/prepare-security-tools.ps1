param(
  [string]$GitleaksVersion = "8.30.1",
  [string]$TrivyVersion = "0.72.0",
  [string]$InstallDir = ".local-tools/security"
)

$ErrorActionPreference = "Stop"

function Resolve-ProjectPath {
  param([string]$PathValue)
  if ([System.IO.Path]::IsPathRooted($PathValue)) {
    return $PathValue
  }
  return Join-Path (Get-Location) $PathValue
}

function Download-And-Extract {
  param(
    [string]$Name,
    [string]$Url,
    [string]$Destination
  )

  $toolDir = Join-Path $Destination $Name
  $zipPath = Join-Path $Destination "$Name.zip"
  New-Item -ItemType Directory -Force -Path $toolDir | Out-Null

  Write-Host "Downloading $Name from $Url"
  Invoke-WebRequest -Uri $Url -OutFile $zipPath -UseBasicParsing

  Write-Host "Extracting $Name to $toolDir"
  Expand-Archive -Path $zipPath -DestinationPath $toolDir -Force
  Remove-Item -LiteralPath $zipPath -Force
}

$resolvedInstallDir = Resolve-ProjectPath $InstallDir
New-Item -ItemType Directory -Force -Path $resolvedInstallDir | Out-Null

$gitleaksUrl = "https://github.com/gitleaks/gitleaks/releases/download/v$GitleaksVersion/gitleaks_${GitleaksVersion}_windows_x64.zip"
$trivyUrl = "https://github.com/aquasecurity/trivy/releases/download/v$TrivyVersion/trivy_${TrivyVersion}_Windows-64bit.zip"

Download-And-Extract -Name "gitleaks" -Url $gitleaksUrl -Destination $resolvedInstallDir
Download-And-Extract -Name "trivy" -Url $trivyUrl -Destination $resolvedInstallDir

$gitleaksExe = Join-Path $resolvedInstallDir "gitleaks/gitleaks.exe"
$trivyExe = Join-Path $resolvedInstallDir "trivy/trivy.exe"

if (!(Test-Path -LiteralPath $gitleaksExe)) {
  throw "gitleaks.exe was not found at $gitleaksExe"
}
if (!(Test-Path -LiteralPath $trivyExe)) {
  throw "trivy.exe was not found at $trivyExe"
}

Write-Host "Security tools ready:"
Write-Host "  $gitleaksExe"
Write-Host "  $trivyExe"
Write-Host "security:evidence automatically searches .local-tools/security/*"
