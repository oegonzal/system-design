# syntax=docker/dockerfile:1.7
#
# One parametrized image for every Nest app:
#
#   docker build -f docker/nest-app.Dockerfile --build-arg APP=studio-api .
#   docker build -f docker/nest-app.Dockerfile --build-arg APP=quality-loop .
#   docker build -f docker/nest-app.Dockerfile --build-arg APP=govcon .
#   docker build -f docker/nest-app.Dockerfile --build-arg APP=notifications .
#   docker build -f docker/nest-app.Dockerfile --build-arg APP=job-application .
#
# The image builds the app itself — deterministic from a bare checkout, never
# dependent on a host-side dist/ that a fresh clone does not have. Layer
# ordering keeps `pnpm install` cached until the lockfile changes, so a source
# edit only re-runs the vite build.
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

FROM base AS build
ARG APP
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/.pnpm-store \
    pnpm install --frozen-lockfile
COPY nx.json tsconfig.base.json vite.nest.ts ./
COPY packages ./packages
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
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=build /repo/packages/${APP} ./packages/${APP}
# `exec` leaves node as PID 1, so it receives SIGTERM; "$@" passes the pod's
# `args` through (govcon's `serve`).
ENTRYPOINT ["sh", "-c", "exec node packages/$APP/dist/main.js \"$@\"", "--"]
