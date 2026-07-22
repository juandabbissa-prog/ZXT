param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('up', 'down', 'rebuild', 'reset-db', 'test')]
  [string]$Action
)

function Ensure-EnvironmentFile {
  if (-not (Test-Path -LiteralPath '.env.local')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env.local'
    Write-Host 'Created .env.local from .env.example.'
  }
}

switch ($Action) {
  'up' { Ensure-EnvironmentFile; docker compose up --build -d }
  'down' { docker compose down }
  'rebuild' { Ensure-EnvironmentFile; docker compose down --remove-orphans; docker compose build --no-cache; docker compose up -d }
  'reset-db' { Ensure-EnvironmentFile; docker compose down --volumes --remove-orphans; docker compose up --build -d }
  'test' { Ensure-EnvironmentFile; docker compose run --rm web bun run test }
}
