#!/usr/bin/env sh
set -eu

ensure_env() {
  if [ ! -f .env.local ]; then
    cp .env.example .env.local
    echo 'Created .env.local from .env.example.'
  fi
}

case "${1:-help}" in
  up)
    ensure_env
    docker compose up --build -d
    ;;
  down)
    docker compose down
    ;;
  rebuild)
    ensure_env
    docker compose down --remove-orphans
    docker compose build --no-cache
    docker compose up -d
    ;;
  reset-db)
    ensure_env
    docker compose down --volumes --remove-orphans
    docker compose up --build -d
    ;;
  test)
    ensure_env
    docker compose run --rm web bun run test
    ;;
  *)
    echo 'Usage: ./scripts/docker.sh {up|down|rebuild|reset-db|test}'
    exit 1
    ;;
esac
