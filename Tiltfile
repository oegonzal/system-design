# System Design Studio — Tilt dev environment
#
# Prerequisites:
#   - Docker Desktop with Kubernetes enabled (or any local k8s cluster)
#   - tilt (https://docs.tilt.dev/install.html)
#
# Usage:
#   tilt up     — start everything
#   tilt down   — tear down the pods and dev servers; the stores keep running
#
# The same stack `pnpm stack:up` starts, with the backends in pods. The stores
# are the docker-compose services both launchers share, so either one shows
# the same runs.
#
# Services:
#   Postgres        → localhost:5433  (admin/admin, db: sysdesign)  [compose]
#   Qdrant          → localhost:6333                                [compose]
#   API             → localhost:3000/api                            [k8s + docker]
#   Quality loop    → localhost:3003/health                         [k8s + docker]
#   Govcon          → localhost:3004/health                         [k8s + docker]
#   Frontend        → localhost:4200                                [local next dev]
#   Quality loop UI → localhost:4201                                [local next dev]
#   Govcon UI       → localhost:4202                                [local next dev]

load('./tilt/toolchain.Tiltfile', 'tool_env')

watch_settings(ignore=['.nx/**', '**/.next/**', '**/.next-dev/**', 'packages/**/vite.config.ts.timestamp-*.mjs'])

include('./tilt/stores/Tiltfile')
include('./packages/studio-api/Tiltfile')
include('./packages/quality-loop/Tiltfile')
include('./packages/govcon/Tiltfile')
include('./packages/studio-ui/Tiltfile')
include('./packages/quality-loop-ui/Tiltfile')
include('./packages/govcon-ui/Tiltfile')

# Root scripts rather than `pnpm mikro-orm` from a package dir: pnpm resolves
# binaries against the nearest package.json, and an Nx package has
# project.json instead — the root is the one place both pnpm and the
# `--config` flag agree on.
local_resource(
    'db: migration:up',
    cmd=['bash', '-c', 'pnpm db:migrate'],
    env=tool_env(),
    resource_deps=['stores', 'stores: config'],
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
    resource_deps=['stores'],
    auto_init=False,
    trigger_mode=TRIGGER_MODE_MANUAL,
    labels=['database']
)
