# syntax=docker/dockerfile:1.7
#
# The image for an app that drives a browser — browser-session — built the
# way `docker/nest-app.Dockerfile` builds a Nest app, on Debian instead of
# Alpine:
#
#   docker build -f docker/playwright-app.Dockerfile --build-arg APP=browser-session .
#
# Debian, because Playwright's browsers link against glibc and do not run on
# musl, so no Alpine image can host them. The browser is the Chromium that
# Playwright bundles, installed at build time into `PLAYWRIGHT_BROWSERS_PATH`
# with the system libraries it needs: Google Chrome (`channel: chrome`, the
# laptop's browser) has no Linux arm64 build, and the task runs on ARM64.
# The browsers path sits outside any home directory so the `node` user that
# runs the app reads the browsers root installed, exactly as Playwright's
# own images lay them out.
#
# The image builds the app itself — deterministic from a bare checkout, never
# dependent on a host-side dist/ that a fresh clone does not have. Layer
# ordering keeps `pnpm install` cached until the lockfile changes, so a source
# edit only re-runs the vite build.
#
# Stages: `base` (node + pnpm) → `sources` (the full install and the
# workspace sources) → `build` (one app's vite bundle) → `runner` (production
# deps, the browser and that bundle, as the unprivileged `node` user);
# `prod-deps` feeds the runner. The runner also carries the migrations folder:
# the CLI checks at start that the database applied every migration the
# checkout carries, reading that folder from the working directory.
#
# Nothing here names a library. The build copies whatever `packages/` the
# context holds.

FROM node:24-bookworm-slim AS base
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

FROM node:24-bookworm-slim AS runner
# The app keeps its repo path under the working directory, so a default that
# resolves against the cwd (the goals, the launches, the migrations folder)
# finds the same place in a task as from the repo root.
WORKDIR /app
ARG APP
ENV APP=${APP}
# Amazon's RDS certificate bundle, so `PGSSLMODE=verify-full` with
# `NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-global-bundle.pem` verifies a
# managed database's certificate. Vendored copy of
# https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem,
# downloaded 2026-11-11.
COPY docker/rds-global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
COPY --from=prod-deps /repo/node_modules ./node_modules
# The browser Playwright pins — the version comes from the installed package,
# never spelled here — with the system libraries it needs, as root, at build
# time; the apt lists are dropped so the layer carries no package cache.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN node_modules/.bin/playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*
# The bundle with the package's own `config/`, `goals/` and `launches/`.
COPY --from=build /repo/packages/${APP} ./packages/${APP}
COPY packages/db/src/migrations ./packages/db/src/migrations
# The process runs as the image's unprivileged `node` user (uid 1000). It
# owns `static/`, where the profiles, the dumps and the documents default to
# (`<cwd>/static/…`), and a home of its own, where Chromium keeps what it
# writes outside the profile.
RUN mkdir -p static && chown node:node static
USER node
ENV HOME=/home/node
# `exec` leaves node as PID 1, so it receives SIGTERM; "$@" passes the task's
# command through (`run --launch linkedin --headless --wait-for-loop 8`).
ENTRYPOINT ["sh", "-c", "exec node packages/$APP/dist/main.js \"$@\"", "--"]
