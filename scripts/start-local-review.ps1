param(
  [string]$PublicHost = $(if ($env:PUBLIC_HOST) { $env:PUBLIC_HOST } else { "localhost" }),
  [int]$NginxPort = $(if ($env:NGINX_PORT) { [int]$env:NGINX_PORT } else { 18080 }),
  [int]$DashboardPort = $(if ($env:DASHBOARD_PORT) { [int]$env:DASHBOARD_PORT } else { 15000 }),
  [int]$FrontendPort = $(if ($env:FRONTEND_PORT) { [int]$env:FRONTEND_PORT } else { 15173 }),
  [int]$PostgresPort = $(if ($env:POSTGRES_PORT) { [int]$env:POSTGRES_PORT } else { 15433 }),
  [int]$ReadyTimeoutSeconds = 120,
  [switch]$SkipBuild,
  [switch]$SkipCompose,
  [switch]$NoArtifact
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$baseUrl = "http://${PublicHost}:$NginxPort"
$startedAt = (Get-Date).ToUniversalTime().ToString("o")

function Test-PortAvailable {
  param([int]$Port)

  $listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -eq $Port }
  return @($listeners).Count -eq 0
}

function Assert-PortAvailable {
  param(
    [string]$Name,
    [int]$Port
  )

  if (!(Test-PortAvailable -Port $Port)) {
    $owners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $_.LocalPort -eq $Port } |
      ForEach-Object {
        $process = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
        if ($process) {
          "$($_.LocalAddress):$($_.LocalPort) pid=$($_.OwningProcess) process=$($process.ProcessName)"
        } else {
          "$($_.LocalAddress):$($_.LocalPort) pid=$($_.OwningProcess)"
        }
      }
    throw "$Name port $Port is already in use. Use a different parameter value. Owners: $($owners -join '; ')"
  }
}

function Wait-HttpOk {
  param(
    [string]$Name,
    [string]$Url,
    [int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastError = ""
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
        return [ordered]@{
          name = $Name
          url = $Url
          status = "PASS"
          httpStatus = $response.StatusCode
          length = $response.Content.Length
        }
      }
      $lastError = "HTTP $($response.StatusCode)"
    } catch {
      $lastError = $_.Exception.Message
    }
    Start-Sleep -Seconds 2
  }

  return [ordered]@{
    name = $Name
    url = $Url
    status = "FAIL"
    error = $lastError
  }
}

function Get-GitInfo {
  Push-Location $root
  try {
    $branch = (& git rev-parse --abbrev-ref HEAD).Trim()
    $commit = (& git rev-parse HEAD).Trim()
    $status = (& git status --short).Trim()
    return [ordered]@{
      branch = $branch
      commit = $commit
      clean = ($status.Length -eq 0)
    }
  } finally {
    Pop-Location
  }
}

function Test-ComposeStackRunning {
  Push-Location $root
  try {
    $services = & docker compose ps --services --filter status=running 2>$null
    if ($LASTEXITCODE -ne 0) {
      return $false
    }
    $serviceSet = @{}
    foreach ($service in $services) {
      if ($service) {
        $serviceSet[$service.Trim()] = $true
      }
    }
    return $serviceSet.ContainsKey("reverse-proxy") -and
      $serviceSet.ContainsKey("backend") -and
      $serviceSet.ContainsKey("frontend") -and
      $serviceSet.ContainsKey("lidar-dashboard-db-postgres")
  } finally {
    Pop-Location
  }
}

if (!$SkipCompose) {
  $composeStackRunning = Test-ComposeStackRunning
  if (!$composeStackRunning) {
    Assert-PortAvailable -Name "Nginx" -Port $NginxPort
    Assert-PortAvailable -Name "Backend" -Port $DashboardPort
    Assert-PortAvailable -Name "Frontend" -Port $FrontendPort
    Assert-PortAvailable -Name "PostgreSQL" -Port $PostgresPort
  }

  $env:PUBLIC_HOST = $PublicHost
  $env:NGINX_PORT = "$NginxPort"
  $env:DASHBOARD_PORT = "$DashboardPort"
  $env:FRONTEND_PORT = "$FrontendPort"
  $env:POSTGRES_PORT = "$PostgresPort"

  Push-Location $root
  try {
    $composeArgs = @("compose", "up", "-d")
    if (!$SkipBuild) {
      $composeArgs += "--build"
    }
    & docker @composeArgs
    if ($LASTEXITCODE -ne 0) {
      throw "docker $($composeArgs -join ' ') failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

$checks = @(
  (Wait-HttpOk -Name "frontend" -Url $baseUrl -TimeoutSeconds $ReadyTimeoutSeconds),
  (Wait-HttpOk -Name "api-health" -Url "$baseUrl/api/health" -TimeoutSeconds $ReadyTimeoutSeconds),
  (Wait-HttpOk -Name "swagger" -Url "$baseUrl/api-docs" -TimeoutSeconds $ReadyTimeoutSeconds)
)

$status = if (@($checks | Where-Object { $_.status -ne "PASS" }).Count -eq 0) { "PASS" } else { "REVIEW" }
$manifest = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  startedAt = $startedAt
  generatedBy = "start-local-review.ps1"
  status = $status
  baseUrl = $baseUrl
  urls = [ordered]@{
    dashboard = $baseUrl
    swagger = "$baseUrl/api-docs"
    health = "$baseUrl/api/health"
  }
  ports = [ordered]@{
    nginx = $NginxPort
    backend = $DashboardPort
    frontend = $FrontendPort
    postgres = $PostgresPort
  }
  checks = $checks
  git = Get-GitInfo
}

if (!$NoArtifact) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $artifactDir = Join-Path $root "artifacts/local-review/$stamp"
  New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
  $jsonPath = Join-Path $artifactDir "manifest.json"
  $mdPath = Join-Path $artifactDir "manifest.md"
  $manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $jsonPath -Encoding UTF8
  @(
    "# Local Review Runtime"
    ""
    "- Status: $status"
    "- Dashboard: $baseUrl"
    "- Swagger: $baseUrl/api-docs"
    "- API health: $baseUrl/api/health"
    "- Nginx port: $NginxPort"
    "- Backend port: $DashboardPort"
    "- Frontend port: $FrontendPort"
    "- PostgreSQL port: $PostgresPort"
    "- Git branch: $($manifest.git.branch)"
    "- Git commit: $($manifest.git.commit)"
    "- Working tree clean: $($manifest.git.clean)"
    ""
    "## Checks"
    ""
  ) | Set-Content -LiteralPath $mdPath -Encoding UTF8
  foreach ($check in $checks) {
    Add-Content -LiteralPath $mdPath -Value "- $($check.name): $($check.status) $($check.url)"
  }
  Write-Host "local review artifact: $artifactDir"
}

Write-Host "local review status: $status"
Write-Host "dashboard: $baseUrl"
Write-Host "swagger: $baseUrl/api-docs"
Write-Host "api health: $baseUrl/api/health"

if ($status -ne "PASS") {
  exit 1
}
