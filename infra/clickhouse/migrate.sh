#!/usr/bin/env bash
set -euo pipefail

CLICKHOUSE_HOST="${CLICKHOUSE_HOST:-localhost}"
CLICKHOUSE_PORT="${CLICKHOUSE_PORT:-8123}"
CLICKHOUSE_USER="${CLICKHOUSE_USER:-amplitude}"
CLICKHOUSE_PASSWORD="${CLICKHOUSE_PASSWORD:-change_me_in_production}"
CLICKHOUSE_DB="${CLICKHOUSE_DB:-amplitude}"

MIGRATIONS_DIR="$(dirname "$0")/migrations"

echo "Running ClickHouse migrations against $CLICKHOUSE_HOST:$CLICKHOUSE_PORT/$CLICKHOUSE_DB"

for file in "$MIGRATIONS_DIR"/*.sql; do
  echo "  Applying $(basename "$file")..."
  curl -s \
    -u "$CLICKHOUSE_USER:$CLICKHOUSE_PASSWORD" \
    "http://$CLICKHOUSE_HOST:$CLICKHOUSE_PORT/" \
    --data-binary @"$file"
  echo "  Done."
done

echo "All migrations applied."
