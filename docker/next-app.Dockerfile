# syntax=docker/dockerfile:1.7
#
# One parametrized image for every Next app:
#
#   docker build -f docker/next-app.Dockerfile --build-arg APP=studio-ui \
#     --build-arg PUBLIC_VAR=NEXT_PUBLIC_API_URL --build-arg PUBLIC_URL=/api .
#   docker build -f docker/next-app.Dockerfile --build-arg APP=quality-loop-ui --build-arg BASE_PATH=/inspector \
#     --build-arg PUBLIC_VAR=NEXT_PUBLIC_QUALITY_LOOP_URL --build-arg PUBLIC_URL=/loop .
#   docker build -f docker/next-app.Dockerfile --build-arg APP=govcon-ui --build-arg BASE_PATH=/govcon \
#     --build-arg PUBLIC_VAR=NEXT_PUBLIC_GOVCON_URL --build-arg PUBLIC_URL=/govcon-api .
#
# The image builds the app itself — deterministic from a bare checkout, never
# dependent on a host-side .next/ that a fresh clone does not have. Layer
# ordering keeps `pnpm install` cached until the lockfile changes, so a source
# edit only re-runs the Next build.
#
# What the build bakes in is declared as build arguments, because a Next app
# reads them at build time and never again: `BASE_PATH` is the prefix the app
# is served under (`next.web.js` reads it as `NEXT_BASE_PATH`; empty for the
# root), and `PUBLIC_VAR`/`PUBLIC_URL` name and set the one `NEXT_PUBLIC_*`
# variable through which the app reaches its API (`packages/web-kit`'s
# request base, so a path like `/api` makes every call same-origin).
#
# Nothing here names a library. The build copies the whole `packages/`
# because the tsconfig `paths` the app compiles against point at sibling
# packages' sources, not at built npm packages.

FROM node:24-alpine AS base
WORKDIR /repo
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

FROM base AS build
ARG APP
ARG BASE_PATH=""
ARG PUBLIC_VAR
ARG PUBLIC_URL
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/.pnpm-store \
    pnpm install --frozen-lockfile
COPY nx.json tsconfig.base.json next.web.js ./
COPY packages ./packages
# The next binary directly rather than nx: no daemon, no graph, no cache
# server inside a container build. `output: 'standalone'` (next.web.js) makes
# the build write a server with only the files it traced.
RUN cd packages/${APP} && \
    NEXT_TELEMETRY_DISABLED=1 NEXT_BASE_PATH="${BASE_PATH}" \
    env ${PUBLIC_VAR:+"$PUBLIC_VAR=$PUBLIC_URL"} ../../node_modules/.bin/next build

FROM node:24-alpine AS runner
WORKDIR /app
ARG APP
ENV APP=${APP}
ENV NEXT_TELEMETRY_DISABLED=1
# The server binds every interface so the task's other containers and the
# gateway reach it; the port is the task's to set at run time.
ENV HOSTNAME=0.0.0.0
# With `outputFileTracingRoot` at the repository root, the standalone tree
# is the repository's shape: `packages/<app>/server.js` beside the pruned
# `node_modules` it needs. The static chunks are not traced into it and go
# where that server looks for them.
COPY --from=build --chown=node:node /repo/packages/${APP}/.next/standalone ./
COPY --from=build --chown=node:node /repo/packages/${APP}/.next/static ./packages/${APP}/.next/static
USER node
ENV HOME=/home/node
# `exec` leaves node as PID 1, so it receives SIGTERM.
CMD ["sh", "-c", "exec node packages/$APP/server.js"]
