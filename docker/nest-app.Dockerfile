# syntax=docker/dockerfile:1.7
#
# One parametrized image for every Nest app, and the migrate task beside it:
#
#   docker build -f docker/nest-app.Dockerfile --build-arg APP=studio-api .
#   docker build -f docker/nest-app.Dockerfile --build-arg APP=quality-loop .
#   docker build -f docker/nest-app.Dockerfile --build-arg APP=govcon .
#   docker build -f docker/nest-app.Dockerfile --build-arg APP=notifications .
#   docker build -f docker/nest-app.Dockerfile --build-arg APP=job-application .
#   docker build -f docker/nest-app.Dockerfile --build-arg APP=agentic-system .
#   docker build -f docker/nest-app.Dockerfile --build-arg APP=gmail .
#   docker build -f docker/nest-app.Dockerfile --build-arg APP=google-calendar .
#   docker build -f docker/nest-app.Dockerfile --target migrate .
#
# The image builds the app itself — deterministic from a bare checkout, never
# dependent on a host-side dist/ that a fresh clone does not have. Layer
# ordering keeps `pnpm install` cached until the lockfile changes, so a source
# edit only re-runs the vite build.
#
# Stages: `base` (node + pnpm) → `sources` (the full install and the
# workspace sources, shared by every app's build and by `migrate`) → `build`
# (one app's vite bundle) → `runner` (production deps + that bundle, as the
# unprivileged `node` user); `prod-deps` feeds the runner. `migrate` runs the
# repository's own `pnpm db:migrate` and `pnpm db:seed` from `sources`, as
# the same `node` user, because the MikroORM CLI and the TypeScript loader
# they need are dev dependencies the runner does not carry.
#
# Nothing here names a library. The build copies whatever `packages/` the
# context holds; each app's Tiltfile narrows the context with `only=` to
# exactly the libraries that app imports.

FROM node:24-alpine AS base
WORKDIR /repo
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

FROM base AS sources
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/.pnpm-store \
    pnpm install --frozen-lockfile
COPY nx.json tsconfig.base.json vite.nest.ts ./
COPY packages ./packages

FROM sources AS build
ARG APP
# The vite binary directly rather than nx: no daemon, no graph, no cache
# server inside a container build.
RUN node_modules/.bin/vite build --config packages/${APP}/vite.config.ts

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/.pnpm-store \
    pnpm install --frozen-lockfile --prod

FROM node:24-alpine AS runner
# The app keeps its repo path under the working directory, so a default that
# resolves against the cwd (the loop's prompt library, its run dumps) finds
# the same place in a pod as from the repo root.
WORKDIR /app
ARG APP
ENV APP=${APP}
# The bundled Claude CLI searches with ripgrep; on Alpine (musl) its built-in
# binary does not run, so the system one is installed and chosen.
RUN apk add --no-cache ripgrep
ENV USE_BUILTIN_RIPGREP=0
# Amazon's RDS certificate bundle, so `PGSSLMODE=verify-full` with
# `NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-global-bundle.pem` verifies a
# managed database's certificate. Vendored copy of
# https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem,
# downloaded 2026-11-11.
COPY docker/rds-global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=build /repo/packages/${APP} ./packages/${APP}
# The process runs as the image's unprivileged `node` user (uid 1000). It
# owns `static/`, where the loop's dump directory defaults to
# `<cwd>/static/runs`, and a home of its own, where the Claude CLI keeps its
# configuration.
RUN mkdir -p static && chown node:node static
USER node
ENV HOME=/home/node
# `exec` leaves node as PID 1, so it receives SIGTERM; "$@" passes the pod's
# `args` through (govcon's `serve`).
ENTRYPOINT ["sh", "-c", "exec node packages/$APP/dist/main.js \"$@\"", "--"]

FROM sources AS migrate
# The one-off task that brings a database up to date: the same commands as
# `pnpm db:migrate` and `pnpm db:seed`, against the connection the `DB_*`
# variables name, as the image's default command. A task started with a
# command override runs that instead — the data import,
# `packages/db/scripts/import-dump.ts`, which restores a `pg_dump` archive
# from the artifacts bucket (named by `ARTIFACTS_BUCKET` in the task
# definition, never here) with the PostgreSQL 16 client installed below. The
# TypeScript config, migrations and scripts are loaded by `@swc-node/register`,
# which reads the project to compile from `SWC_NODE_PROJECT`; the certificate
# bundle is the runner's, for a managed database over TLS (node reads it
# through `NODE_EXTRA_CA_CERTS`, libpq through `PGSSLROOTCERT`).
COPY docker/rds-global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
RUN apk add --no-cache postgresql16-client
ENV SWC_NODE_PROJECT=packages/db/tsconfig.lib.json
# The task runs as the unprivileged `node` user (uid 1000), as the runner
# does. The checkout stays root-owned and read-only to it: the migrator
# writes no snapshot (`snapshot: false` in `packages/db/src/migrator.ts`),
# so the CLI needs nothing under /repo; the import writes under /tmp.
USER node
ENV HOME=/home/node
# `exec "$@"` runs whatever command the task was given as PID 1; without an
# override, that is CMD — the migration, then the seed.
ENTRYPOINT ["sh", "-c", "exec \"$@\"", "--"]
CMD ["sh", "-c", "node_modules/.bin/mikro-orm migration:up --config packages/db/mikro-orm.config.ts && node -r @swc-node/register packages/db/scripts/seed.ts"]
