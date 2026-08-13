# Start PostgreSQL for local development (Docker Compose)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "==> Checking Docker..."
$dockerOk = $false
try {
  docker info 2>$null | Out-Null
  $dockerOk = $true
} catch {
  $dockerOk = $false
}

if (-not $dockerOk) {
  Write-Host "Docker is not running. Starting Docker Desktop..."
  $dockerDesktop = "${env:ProgramFiles}\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $dockerDesktop) {
    Start-Process $dockerDesktop
    Write-Host "Waiting for Docker Desktop to start (up to 90s)..."
    $deadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $deadline) {
      Start-Sleep -Seconds 3
      try {
        docker info 2>$null | Out-Null
        $dockerOk = $true
        break
      } catch { }
    }
  }
}

if (-not $dockerOk) {
  Write-Host "ERROR: Docker Desktop is not available. Please start it manually, then re-run this script."
  exit 1
}

Write-Host "==> Starting PostgreSQL container..."
docker compose -f "$root\docker-compose.dev.yml" up -d postgres

Write-Host "==> Waiting for PostgreSQL on localhost:5433..."
$deadline = (Get-Date).AddSeconds(60)
$ready = $false
while ((Get-Date) -lt $deadline) {
  try {
    $tcp = Test-NetConnection -ComputerName 127.0.0.1 -Port 5433 -WarningAction SilentlyContinue
    if ($tcp.TcpTestSucceeded) { $ready = $true; break }
  } catch { }
  Start-Sleep -Seconds 2
}

if (-not $ready) {
  Write-Host "WARNING: Port 5433 not responding yet. Check: docker compose -f docker-compose.dev.yml logs postgres"
  exit 1
}

Write-Host "==> PostgreSQL is ready on port 5433"
Write-Host "==> Run schema sync: cd backend; npx prisma db push --skip-generate"
Write-Host "==> Then start API: cd backend; npm run dev"
