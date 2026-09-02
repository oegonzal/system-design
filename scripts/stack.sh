#!/usr/bin/env bash
#
# One-command local stack for System Design Studio, backed by the durable
# docker-compose Postgres. Brings runs back after any shutdown:
#   pnpm stack:up     # db (durable) -> migrate -> seed -> api + worker + ui
#   pnpm stack:down   # stop the db container (data persists in the named volume)
#   pnpm stack:db     # just the database, ready for tests/tools
#
# Grading is deterministic: with no ANTHROPIC_API_KEY the app uses the no-op LLM,
# and EVAL_DETERMINISTIC=1 pins it, so re-evaluating a stored revision reproduces
# its score. The AI coach (improvement runs) is the exception by design: it only
# PROPOSES — the deterministic engine re-scores every candidate — so
# IMPROVER_DETERMINISTIC=0 lets it go live when ANTHROPIC_API_KEY is exported,
# without touching grade reproducibility.
set -euo pipefail
cd "$(dirname "$0")/.."

export DB_PORT="${DB_PORT:-5433}"
export EVAL_DETERMINISTIC="${EVAL_DETERMINISTIC:-1}"
export IMPROVER_DETERMINISTIC="${IMPROVER_DETERMINISTIC:-0}"

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

case "${1:-up}" in
  db)
    docker compose up -d db
    wait_db
    ;;
  up)
    docker compose up -d db
    wait_db
    echo "applying migrations ..."
    pnpm db:migrate
    echo "seeding reference data ..."
    pnpm db:seed
    echo "starting api + worker + ui (DB_PORT=${DB_PORT}, EVAL_DETERMINISTIC=${EVAL_DETERMINISTIC}) — Ctrl-C to stop"
    pnpm start
    ;;
  down)
    # `pnpm start` runs the app in the foreground of `stack:up`; Ctrl-C stops it.
    # This stops the database container — its data stays in the named volume.
    docker compose stop db
    ;;
  *)
    echo "usage: stack.sh [up|down|db]" >&2
    exit 1
    ;;
esac
