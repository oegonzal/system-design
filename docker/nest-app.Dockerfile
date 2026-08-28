# syntax=docker/dockerfile:1.7
#
# One parametrized image for both Nest apps:
#
#   docker build -f docker/nest-app.Dockerfile --build-arg APP=studio-api .
#   docker build -f docker/nest-app.Dockerfile --build-arg APP=eval-worker .
#
# The image builds the app itself — deterministic from a bare checkout, never
# dependent on a host-side dist/ that a fresh clone does not have. Layer
# ordering keeps `pnpm install` cached until the lockfile changes, so a source
# edit only re-runs the vite build.

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
COPY packages/contracts ./packages/contracts
COPY packages/criteria ./packages/criteria
COPY packages/db ./packages/db
COPY packages/${APP} ./packages/${APP}
# The vite binary directly rather than nx: no daemon, no graph, no cache
# server inside a container build.
RUN node_modules/.bin/vite build --config packages/${APP}/vite.config.ts

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/.pnpm-store \
    pnpm install --frozen-lockfile --prod

FROM node:24-alpine AS runner
WORKDIR /app
ARG APP
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=build /repo/packages/${APP}/dist ./dist
ENTRYPOINT ["node", "dist/main.js"]
