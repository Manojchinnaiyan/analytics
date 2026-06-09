#!/usr/bin/env bash
# Selective deploy/update for the production stack. Run from infra/ on the server.
# Rebuilds ONLY the services whose source changed since the last successful deploy
# (tracked in infra/.last_deploy_sha). First run, or an infra/compose change,
# builds everything.
set -euo pipefail
cd "$(dirname "$0")"                 # -> infra/
ROOT="$(cd .. && pwd)"
COMPOSE="docker compose -f docker-compose.prod.yml"

[ -f .env ] || { echo "ERROR: infra/.env not found. Copy .env.prod.example -> .env and fill it in."; exit 1; }

NEW="$(git -C "$ROOT" rev-parse HEAD)"
LAST_FILE=".last_deploy_sha"
OLD=""
[ -f "$LAST_FILE" ] && OLD="$(cat "$LAST_FILE")"

declare -A SVC                       # services to rebuild
ALL=0
RELOAD_CADDY=0

if [ -z "$OLD" ] || ! git -C "$ROOT" cat-file -e "$OLD^{commit}" 2>/dev/null; then
  echo "▶ First deploy (or unknown previous SHA) — building everything."
  ALL=1
else
  CHANGED="$(git -C "$ROOT" diff --name-only "$OLD" "$NEW")"
  if [ -z "$CHANGED" ]; then
    echo "▶ No file changes since last deploy — nothing to do."
    echo "$NEW" > "$LAST_FILE"; $COMPOSE ps; exit 0
  fi
  echo "▶ Changed since last deploy:"; echo "$CHANGED" | sed 's/^/   /'
  while IFS= read -r f; do
    case "$f" in
      apps/ingestion/*)                 SVC[ingestion]=1 ;;
      apps/query/*)                     SVC[query]=1 ;;
      apps/worker/*)                    SVC[worker]=1 ;;
      dashboard/*)                      SVC[dashboard]=1 ;;
      infra/docker-compose.prod.yml)    ALL=1 ;;        # topology change → full apply
      infra/.env|infra/.env.prod.example) ALL=1 ;;      # env (incl. PUBLIC_* build args) → rebuild
      infra/Caddyfile)                  RELOAD_CADDY=1 ;;
      go.work|go.work.sum)              SVC[ingestion]=1; SVC[query]=1; SVC[worker]=1 ;;
      *) : ;;                                           # packages/, docs, .github, README → no deploy
    esac
  done <<< "$CHANGED"
fi

if [ "$ALL" = "1" ]; then
  echo "▶ Building all app images…"
  $COMPOSE build
  $COMPOSE up -d
elif [ ${#SVC[@]} -gt 0 ]; then
  TARGETS="${!SVC[@]}"
  echo "▶ Rebuilding only: $TARGETS"
  $COMPOSE build $TARGETS
  $COMPOSE up -d $TARGETS
else
  echo "▶ No deployable service changed."
fi

if [ "$RELOAD_CADDY" = "1" ]; then
  echo "▶ Reloading Caddy config…"
  $COMPOSE exec -T caddy caddy reload --config /etc/caddy/Caddyfile 2>/dev/null \
    || $COMPOSE restart caddy
fi

# Health-gate on query if it's running.
echo "▶ Waiting for query health…"
for i in $(seq 1 30); do
  if $COMPOSE exec -T query wget -qO- http://localhost:4001/health >/dev/null 2>&1; then
    echo "✓ query healthy"; break
  fi
  sleep 2
done

echo "$NEW" > "$LAST_FILE"           # record only after a clean run
echo "▶ Status:"; $COMPOSE ps
echo "✓ Deploy complete."
