#!/usr/bin/env bash
# Selective, near-zero-downtime deploy for the production stack. Run from infra/
# on the server. Rebuilds ONLY the services whose source changed since the last
# successful deploy (tracked in infra/.last_deploy_sha). First run, or an
# infra/compose change, builds everything.
#
# Safety: services are recreated in place with --force-recreate (no destructive
# `rm -f`) and --no-deps, so an unhealthy dependency (e.g. a flaky kafka
# healthcheck) can NEVER block the recreate and leave a service with no
# container. After deploy we health-check; if it fails we AUTO-ROLL-BACK to the
# previous image. This is what prevents the "deploy took the site down" outage.
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

# Resolve the concrete set of app services we're (re)deploying.
if [ "$ALL" = "1" ]; then
  TARGETS="query ingestion worker dashboard"
else
  TARGETS="${SVC# }"
fi

if [ -z "$TARGETS" ]; then
  echo "▶ No deployable service changed."
  if [ "$RELOAD_CADDY" = "1" ]; then
    echo "▶ Reloading Caddy config…"
    $COMPOSE exec -T caddy caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || $COMPOSE restart caddy
  fi
  echo "$NEW" > "$LAST_FILE"; exit 0
fi

# Snapshot current image IDs so we can roll back if the new build is bad.
declare -A OLD_IMG
for svc in $TARGETS; do
  OLD_IMG[$svc]="$(docker image inspect --format '{{.Id}}' "infra-${svc}:latest" 2>/dev/null || true)"
done

echo "▶ Building: $TARGETS"
$COMPOSE build $TARGETS

# Recreate in place: --force-recreate (no `rm -f`) + --no-deps (don't let an
# unhealthy dependency block the start). One service at a time.
for svc in $TARGETS; do
  echo "▶ Recreating $svc"
  $COMPOSE up -d --no-deps --force-recreate "$svc"
done

if [ "$RELOAD_CADDY" = "1" ]; then
  echo "▶ Reloading Caddy config…"
  $COMPOSE exec -T caddy caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || $COMPOSE restart caddy
fi

# Health check over the compose network (Go images are static — no curl in them,
# so we probe from a throwaway curl container on the same network).
NET="$(docker network ls --format '{{.Name}}' | grep -E 'infra_default|analytics_default' | head -1 || true)"
[ -z "$NET" ] && NET="$(docker inspect "$($COMPOSE ps -q query)" -f '{{range $k,$_ := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null || true)"

probe() { # svc -> internal URL
  case "$1" in
    query)     echo "http://query:4001/health" ;;
    ingestion) echo "http://ingestion:4000/health" ;;
    dashboard) echo "http://dashboard:3000/" ;;
    *)         echo "" ;;
  esac
}

echo "▶ Health-checking (waiting up to 60s)…"
fail=0
for svc in $TARGETS; do
  url="$(probe "$svc")"; [ -z "$url" ] && continue
  ok=0
  for _ in $(seq 1 30); do
    if docker run --rm --network "$NET" curlimages/curl:8.11.1 -sf -m 3 "$url" >/dev/null 2>&1; then
      echo "✓ $svc healthy"; ok=1; break
    fi
    sleep 2
  done
  [ "$ok" = 1 ] || { echo "✗ $svc did NOT become healthy"; fail=1; }
done

if [ "$fail" -ne 0 ]; then
  echo "!! Health check failed — ROLLING BACK to previous images"
  for svc in $TARGETS; do
    if [ -n "${OLD_IMG[$svc]:-}" ]; then
      docker tag "${OLD_IMG[$svc]}" "infra-${svc}:latest"
      $COMPOSE up -d --no-deps --force-recreate "$svc"
    fi
  done
  echo "!! Rolled back. New build failed health checks — DID NOT record SHA. Investigate."
  $COMPOSE ps
  exit 1
fi

echo "$NEW" > "$LAST_FILE"           # record only after a clean, healthy run
echo "▶ Status:"; $COMPOSE ps
echo "✓ Deploy complete."
