$ErrorActionPreference = 'Stop'

./scripts/docker.ps1 up
for ($attempt = 1; $attempt -le 30; $attempt++) {
  try {
    Invoke-WebRequest -UseBasicParsing 'http://localhost:3000/api/health' | Out-Null
    break
  } catch {
    if ($attempt -eq 30) {
      docker compose ps
      docker compose logs --no-color
      throw
    }
    Start-Sleep -Seconds 2
  }
}

Invoke-WebRequest -UseBasicParsing 'http://localhost:3000/api/health/database' | Out-Null
Invoke-WebRequest -UseBasicParsing 'http://localhost:3000/api/health/redis' | Out-Null
./scripts/docker.ps1 test
docker compose ps
Write-Host 'Local container acceptance passed.'
