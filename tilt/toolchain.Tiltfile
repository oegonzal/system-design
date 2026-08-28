# Resolves the Node toolchain once, for every `local_resource` in this project.
#
# Tilt inherits the PATH of whatever shell ran `tilt up`. A shell that never
# sourced nvm — a GUI launch, a fresh terminal — has no `pnpm` or `nx`, and
# every local resource dies with `command not found` while the Kubernetes ones
# stay green because Docker builds them. That failure is quiet and easy to
# misread as "the app works".
#
# So the PATH is computed here rather than assumed. What this must never do is
# take the rest of the stack down with it: a probe that fails the Tiltfile
# stops Postgres and the deployments from loading too, which is worse than the
# problem it reports. It warns and degrades instead.

# Runs in the repo root (`dir=` below), so `.nvmrc` is a relative read.
_PROBE = """
set -eu

# The pinned major. Honouring a PATH *older* than this is the failure worth
# guarding against: @mikro-orm/core declares engines ">= 22.17.0", so an
# inherited Node 20 gets all the way to `db: migration:up` before dying — a
# long way from here, and unrecognisable. tr -dc keeps digits only, so a stray
# `v`, CRLF or trailing space cannot corrupt the comparison.
want="$(tr -dc '0-9' < .nvmrc)"
[ -n "$want" ] || want=0

# Already configured and new enough — an nvm-sourced shell, Homebrew, asdf, a
# CI image. Honour it rather than second-guessing it.
if command -v node >/dev/null 2>&1 && command -v pnpm >/dev/null 2>&1; then
  have="$(node -v | tr -dc '0-9.' | cut -d. -f1)"
  if [ "$have" -ge "$want" ]; then
    dirname "$(command -v node)"
    exit 0
  fi
fi

# Otherwise resolve .nvmrc the way nvm does: newest installed match of the
# pinned major wins. $NVM_DIR is nvm's own contract; installers relocate it,
# so it is read rather than assumed to be ~/.nvm.
candidate="$(ls -d "${NVM_DIR:-$HOME/.nvm}/versions/node/v${want}."* 2>/dev/null | sort -V | tail -1)"
if [ -n "$candidate" ] && [ -x "$candidate/bin/node" ]; then
  echo "$candidate/bin"
fi

# Nothing found: print nothing and succeed. Exiting non-zero here would fail
# the whole Tiltfile; the caller warns instead.
exit 0
"""

NODE_BIN = str(local(_PROBE, dir=config.main_dir, quiet=True, echo_off=True)).strip()

if not NODE_BIN:
    warn(
        'toolchain: found no Node matching the .nvmrc pin.\n'
        + '  Local resources (migrations, seed, the Next dev server) will fail\n'
        + '  with "command not found" until one is on PATH.\n'
        + '  Fix: bash scripts/setup.sh, then run `tilt up` from that same terminal.'
    )

def tool_env():
    """PATH for a local_resource: the pinned Node first, then the repo's binaries."""
    parts = [config.main_dir + '/node_modules/.bin', os.getenv('PATH', '')]
    if NODE_BIN:
        parts = [NODE_BIN] + parts
    return {'PATH': ':'.join(parts)}
