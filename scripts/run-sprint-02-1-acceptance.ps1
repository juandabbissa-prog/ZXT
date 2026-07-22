param(
  [switch]$RunDocker,
  [string]$LogDirectory = 'artifacts/sprint-02-1-acceptance'
)

$ErrorActionPreference = 'Stop'
$results = [System.Collections.Generic.List[object]]::new()
New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null

function Invoke-Stage {
  param([string]$Name, [scriptblock]$Action)

  $safeName = $Name -replace '[^a-zA-Z0-9.-]', '_'
  $log = Join-Path $LogDirectory "$safeName.log"
  $startedAt = Get-Date
  $success = $true
  $exitCode = 0

  try {
    & $Action *>&1 | Tee-Object -FilePath $log
    if ($LASTEXITCODE -ne 0) {
      $success = $false
      $exitCode = $LASTEXITCODE
    }
  } catch {
    $_ | Out-String | Tee-Object -FilePath $log -Append | Out-Host
    $success = $false
    $exitCode = 1
  }

  $results.Add([pscustomobject]@{
    stage = $Name
    success = $success
    exitCode = $exitCode
    startedAt = $startedAt.ToString('o')
    finishedAt = (Get-Date).ToString('o')
    log = $log
  })
}

Invoke-Stage '00-prerequisites' {
  bun --version
}

if (-not $results[0].success) {
  $summary = Join-Path $LogDirectory 'summary.json'
  $results | ConvertTo-Json | Set-Content -Path $summary -Encoding utf8
  throw "Bun is required before Sprint 02.1 acceptance can start. See $summary"
}

Invoke-Stage '01-install-and-lockfile' {
  bun install
  if (-not (Test-Path 'bun.lock')) { throw 'bun.lock was not generated. Commit the generated lockfile before CI acceptance.' }
}
Invoke-Stage '02-prisma-generate' { bun run db:generate }
Invoke-Stage '03-prisma-validate' { bun run db:validate }
Invoke-Stage '04-prisma-migrate' { bun run db:migrate }
Invoke-Stage '05-architecture-check' { bun run architecture:check }
Invoke-Stage '06-unit-and-integration-tests' {
  $env:RUN_DATABASE_INTEGRATION_TESTS = 'true'
  bun run test
}
Invoke-Stage '07-build' { bun run build }

if ($RunDocker) {
  Invoke-Stage '08-docker-prerequisites' {
    docker --version
    docker compose version
  }
  Invoke-Stage '08-docker-smoke' {
    if (-not (Test-Path '.env.local')) { Copy-Item '.env.example' '.env.local' }
    docker compose up --build -d
    try {
      $healthy = $false
      foreach ($attempt in 1..30) {
        try {
          Invoke-WebRequest 'http://localhost:3000/api/health' -UseBasicParsing | Out-Null
          $healthy = $true
          break
        } catch { Start-Sleep -Seconds 2 }
      }
      if (-not $healthy) { throw 'Web health endpoint did not become ready.' }
      Invoke-WebRequest 'http://localhost:3000/api/health/database' -UseBasicParsing | Out-Null
      Invoke-WebRequest 'http://localhost:3000/api/health/redis' -UseBasicParsing | Out-Null
    } finally {
      docker compose ps
      docker compose logs --no-color
      docker compose down
    }
  }
}

$summary = Join-Path $LogDirectory 'summary.json'
$results | ConvertTo-Json | Set-Content -Path $summary -Encoding utf8
$results | Format-Table -AutoSize

if ($results.Where({ -not $_.success }).Count -gt 0) {
  throw "Sprint 02.1 acceptance has failures. See $summary"
}

Write-Host "Sprint 02.1 acceptance passed. Logs: $LogDirectory"
