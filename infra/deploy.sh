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

SVC=""                               # space-separated services to rebuild (set -u safe)
add_svc() { case " $SVC " in *" $1 "*) ;; *) SVC="$SVC $1" ;; esac; }
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
      apps/ingestion/*)                 add_svc ingestion ;;
      apps/query/*)                     add_svc query ;;
      apps/worker/*)                    add_svc worker ;;
      dashboard/*)                      add_svc dashboard ;;
      infra/docker-compose.prod.yml)    ALL=1 ;;        # topology change → full apply
      infra/.env|infra/.env.prod.example) ALL=1 ;;      # env (incl. PUBLIC_* build args) → rebuild
      infra/Caddyfile)                  RELOAD_CADDY=1 ;;
      go.work|go.work.sum)              add_svc ingestion; add_svc query; add_svc worker ;;
      *) : ;;                                           # packages/, docs, .github, README → no deploy
    esac
  done <<< "$CHANGED"
fi

if [ "$ALL" = "1" ]; then
  echo "▶ Building all app images…"
  $COMPOSE build
  $COMPOSE up -d
elif [ -n "${SVC# }" ]; then
  TARGETS="${SVC# }"
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

# Health-gate on query. The Go images are static binaries (no shell/wget/curl),
# so probe the endpoint over the compose network with a throwaway curl container.
echo "▶ Waiting for query health…"
QID=$($COMPOSE ps -q query 2>/dev/null || true)
NET=$(docker inspect "$QID" -f '{{range $k,$_ := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null || true)
if [ -n "$NET" ]; then
  for i in $(seq 1 30); do
    if docker run --rm --network "$NET" curlimages/curl:8.11.1 -sf -m 3 http://query:4001/health >/dev/null 2>&1; then
      echo "✓ query healthy"; break
    fi
    [ "$i" = 30 ] && echo "⚠ query did not report healthy in 60s (check: docker logs inspectuser_query)"
    sleep 2
  done
fi

echo "$NEW" > "$LAST_FILE"           # record only after a clean run
echo "▶ Status:"; $COMPOSE ps
echo "✓ Deploy complete."
