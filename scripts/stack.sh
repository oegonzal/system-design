#!/usr/bin/env bash
#
# One-command local stack for System Design Studio, backed by the durable
# docker-compose Postgres. Brings runs back after any shutdown:
#   pnpm stack:up     # db (durable) -> migrate -> seed -> api + quality loop + ui
#   pnpm stack:down   # stop the db + vectors containers (data persists in the named volumes)
#   pnpm stack:db     # database + vector store, ready for tests/tools
#
# Grading, coaching and prompt generation are runs of the quality loop, which
# runs on a model or not at all: an exported ANTHROPIC_API_KEY wins; otherwise
# QUALITY_LOOP_AUTH=claude-code (the default here) runs it through this
# machine's Claude Code login (subscription). Without either the loop exits
# at boot with its own message naming both — there is no switch that runs it
# without a model.
set -euo pipefail
cd "$(dirname "$0")/.."

export DB_PORT="${DB_PORT:-5433}"
export QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
export QUALITY_LOOP_URL="${QUALITY_LOOP_URL:-http://localhost:3003}"
export QUALITY_LOOP_AUTH="${QUALITY_LOOP_AUTH:-claude-code}"

wait_db() {
  echo "waiting for postgres on :${DB_PORT} ..."
  for _ in $(seq 1 60); do
    if docker compose exec -T db pg_isready -U admin -d sysdesign >/dev/null 2>&1; then
      echo "postgres ready"
      return 0
    fi
    sleep 1
  done
  echo "postgres did not become ready" >&2
  return 1
}

wait_vectors() {
  echo "waiting for qdrant at ${QDRANT_URL} ..."
  for _ in $(seq 1 60); do
    if curl -sf "${QDRANT_URL}/readyz" >/dev/null 2>&1; then
      echo "qdrant ready"; return 0
    fi
    sleep 1
  done
  echo "qdrant did not become ready" >&2
  return 1
}

case "${1:-up}" in
  db)
    docker compose up -d db vectors
    wait_db
    wait_vectors
    ;;
  up)
    docker compose up -d db vectors
    wait_db
    wait_vectors
    echo "applying migrations ..."
    pnpm db:migrate
    echo "seeding reference data ..."
    pnpm db:seed
    # Which route the loop will boot on — never the key itself.
    model_route="QUALITY_LOOP_AUTH=${QUALITY_LOOP_AUTH}"
    if [ -n "${ANTHROPIC_API_KEY:-}" ]; then model_route="ANTHROPIC_API_KEY"; fi
    echo "starting api + quality loop + ui (DB_PORT=${DB_PORT}, model via ${model_route}) — Ctrl-C to stop"
    pnpm start
    ;;
  down)
    # `pnpm start` runs the app in the foreground of `stack:up`; Ctrl-C stops it.
    # This stops the database and vector-store containers — their data stays in the named volumes.
    docker compose stop db vectors
    ;;
  *)
    echo "usage: stack.sh [up|down|db]" >&2
    exit 1
    ;;
esac
