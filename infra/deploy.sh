#!/usr/bin/env bash
# One-shot deploy/update for the production stack. Run from infra/ on the server.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "ERROR: infra/.env not found. Copy .env.prod.example → .env and fill it in."
  exit 1
fi

COMPOSE="docker compose -f docker-compose.prod.yml"

echo "▶ Building images…"
$COMPOSE build

echo "▶ Starting stack…"
$COMPOSE up -d

echo "▶ Waiting for query health…"
for i in $(seq 1 60); do
  if $COMPOSE exec -T query wget -qO- http://localhost:4001/health >/dev/null 2>&1; then
    echo "✓ query healthy"; break
  fi
  sleep 2
done

echo "▶ Status:"
$COMPOSE ps
echo "✓ Deploy complete. Tailing logs (Ctrl-C to stop):"
$COMPOSE logs -f --tail=20 query worker ingestion
