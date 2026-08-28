# System Design Studio — Tilt dev environment
#
# Prerequisites:
#   - Docker Desktop with Kubernetes enabled (or any local k8s cluster)
#   - tilt (https://docs.tilt.dev/install.html)
#
# Usage:
#   tilt up     — start everything
#   tilt down   — tear down all resources
#
# Services:
#   Postgres     → localhost:5432  (admin/admin, db: sysdesign)  [k8s]
#   API          → localhost:3000/api                            [k8s + docker]
#   Eval worker  → localhost:3002/health                         [k8s + docker]
#   Frontend     → localhost:4200                                [local next dev]

load('./tilt/toolchain.Tiltfile', 'tool_env')

watch_settings(ignore=['.nx/**', '**/.next/**', 'packages/**/vite.config.ts.timestamp-*.mjs'])

include('./tilt/postgres/Tiltfile')
include('./packages/studio-api/Tiltfile')
include('./packages/eval-worker/Tiltfile')
include('./packages/studio-ui/Tiltfile')

# Root scripts rather than `pnpm mikro-orm` from a package dir: pnpm resolves
# binaries against the nearest package.json, and an Nx package has
# project.json instead — the root is the one place both pnpm and the
# `--config` flag agree on.
local_resource(
    'db: migration:up',
    cmd=['bash', '-c', 'pnpm db:migrate'],
    env=tool_env(),
    resource_deps=['sysdesign-postgres'],
    labels=['database']
)

local_resource(
    'db: seed',
    cmd=['bash', '-c', 'pnpm db:seed'],
    env=tool_env(),
    resource_deps=['db: migration:up'],
    labels=['database']
)

local_resource(
    'db: migration:create',
    cmd=['bash', '-c', 'pnpm db:migrate:create'],
    env=tool_env(),
    resource_deps=['sysdesign-postgres'],
    auto_init=False,
    trigger_mode=TRIGGER_MODE_MANUAL,
    labels=['database']
)
