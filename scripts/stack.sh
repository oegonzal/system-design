#!/usr/bin/env bash
#
# One-command local stack for System Design Studio, backed by the durable
# docker-compose Postgres. Brings runs back after any shutdown:
#   pnpm stack:up     # db (durable) -> migrate -> seed -> api + quality loop + ui
#   pnpm stack:down   # stop the db + vectors containers (data persists in the named volumes)
#   pnpm stack:db     # database + vector store, ready for tests/tools
#
# Grading, coaching and prompt generation are runs of the quality loop, which
# runs on this machine's Claude Code subscription login and nothing else. It
# checks the login at boot and exits with its own message when there is none
# (`claude login` fixes it). No API key is read.
set -euo pipefail
cd "$(dirname "$0")/.."

# Nothing is exported: the apps' defaults (DB_PORT, QDRANT_URL,
# QUALITY_LOOP_URL) already point at these containers and at each other.

wait_db() {
  echo "waiting for postgres on $(docker compose port db 5432) ..."
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
  # The address compose published, so the check follows docker-compose.yml.
  local url
  url="http://$(docker compose port vectors 6333)"
  echo "waiting for qdrant at ${url} ..."
  for _ in $(seq 1 60); do
    if curl -sf "${url}/readyz" >/dev/null 2>&1; then
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
    echo "starting api + quality loop + ui (model via the Claude Code login) — Ctrl-C to stop"
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
