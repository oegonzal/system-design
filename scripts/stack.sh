#!/usr/bin/env bash
#
# One-command local stack for System Design Studio, backed by the durable
# docker-compose Postgres. Brings runs back after any shutdown:
#   pnpm stack:up     # db (durable) -> migrate -> seed -> api + quality loop + ui
#   pnpm stack:down   # stop the db container (data persists in the named volume)
#   pnpm stack:db     # the database alone, ready for tests/tools (and `tilt up`)
#
# The database is also the memory tier: its image (`postgres:16-alpine` plus
# the pgvector extension, docker/postgres-pgvector.Dockerfile) is built by
# compose the first time `up` or `db` runs — under a minute, once — and the
# tagged image is reused after that (`docker compose build db` rebuilds it).
#
# Grading, coaching and prompt generation are runs of the quality loop, which
# runs on this machine's Claude Code subscription login and nothing else. It
# checks the login at boot and exits with its own message when there is none
# (`claude login` fixes it). No API key is read.
set -euo pipefail
cd "$(dirname "$0")/.."

# Nothing is exported: the apps' defaults (DB_PORT, QUALITY_LOOP_URL) already
# point at this container and at each other.

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
    echo "starting api + quality loop + ui (model via the Claude Code login) — Ctrl-C to stop"
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
