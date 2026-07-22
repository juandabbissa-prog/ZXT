#!/usr/bin/env sh
set -eu

./scripts/docker.sh up

attempt=1
while [ "$attempt" -le 30 ]; do
  if curl --fail --silent http://localhost:3000/api/health >/dev/null; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    docker compose ps
    docker compose logs --no-color
    exit 1
  fi
  sleep 2
  attempt=$((attempt + 1))
done

curl --fail --silent http://localhost:3000/api/health/database >/dev/null
curl --fail --silent http://localhost:3000/api/health/redis >/dev/null
./scripts/docker.sh test
docker compose ps
echo 'Local container acceptance passed.'
