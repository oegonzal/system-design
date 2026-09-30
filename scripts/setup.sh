#!/usr/bin/env bash
#
# Preflight for the local dev environment. Verifies the toolchain, installs
# dependencies, and points you at `tilt up`. Safe to re-run any time.
set -u

BOLD=$(tput bold 2>/dev/null || true)
RED=$(tput setaf 1 2>/dev/null || true)
GREEN=$(tput setaf 2 2>/dev/null || true)
YELLOW=$(tput setaf 3 2>/dev/null || true)
RESET=$(tput sgr0 2>/dev/null || true)

ok() { echo "  ${GREEN}✓${RESET} $1"; }
warn() { echo "  ${YELLOW}!${RESET} $1"; }
fail() {
  echo "  ${RED}✗${RESET} $1"
  ERRORS=$((ERRORS + 1))
}

ERRORS=0
cd "$(dirname "$0")/.."
WANT_NODE="$(tr -dc '0-9' < .nvmrc)"

echo ""
echo "${BOLD}System Design Studio — setup${RESET}"
echo ""

# --------------------------------------------------------------- 1. Node via nvm
echo "${BOLD}1. Node ${WANT_NODE}${RESET}"
if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  nvm install "$WANT_NODE" > /dev/null 2>&1
  nvm use "$WANT_NODE" > /dev/null 2>&1
  ok "node $(node -v) via nvm"
elif command -v node > /dev/null 2>&1; then
  HAVE="$(node -v | tr -dc '0-9.' | cut -d. -f1)"
  if [ "$HAVE" -ge "$WANT_NODE" ]; then
    ok "node $(node -v) already on PATH"
  else
    fail "node $(node -v) is older than the .nvmrc pin ($WANT_NODE). Install nvm or Node $WANT_NODE+."
  fi
else
  fail "no node found. Install nvm (https://github.com/nvm-sh/nvm) and re-run."
fi

# ------------------------------------------------------------------- 2. pnpm
echo "${BOLD}2. pnpm (via corepack)${RESET}"
if command -v corepack > /dev/null 2>&1; then
  export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
  corepack enable > /dev/null 2>&1 || true
  if command -v pnpm > /dev/null 2>&1; then
    ok "pnpm $(pnpm -v)"
  else
    fail "corepack could not activate pnpm — check write access to your Node bin dir."
  fi
else
  fail "corepack not found (ships with Node ≥ 16.13)."
fi

# ----------------------------------------------------- 3. Docker + Kubernetes
echo "${BOLD}3. Docker Desktop + Kubernetes${RESET}"
if docker info > /dev/null 2>&1; then
  ok "docker daemon reachable"
else
  fail "docker daemon not running. Start Docker Desktop."
fi
if kubectl config get-contexts docker-desktop > /dev/null 2>&1 && kubectl cluster-info --context docker-desktop > /dev/null 2>&1; then
  ok "kubernetes (docker-desktop context) reachable"
else
  fail "no docker-desktop Kubernetes context. Enable Kubernetes in Docker Desktop → Settings."
fi

# -------------------------------------------------------------------- 4. Tilt
echo "${BOLD}4. Tilt${RESET}"
if command -v tilt > /dev/null 2>&1; then
  ok "tilt $(tilt version 2>/dev/null | head -1)"
else
  fail "tilt not found. https://docs.tilt.dev/install.html"
fi

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "${RED}${BOLD}$ERRORS problem(s) found.${RESET} Fix them and re-run: bash scripts/setup.sh"
  exit 1
fi

# ------------------------------------------------------------------ 5. install
echo "${BOLD}5. Dependencies${RESET}"
if pnpm install; then
  ok "pnpm install"
else
  echo "${RED}${BOLD}pnpm install failed.${RESET}"
  exit 1
fi

echo ""
echo "${GREEN}${BOLD}Ready.${RESET} Start everything with:"
echo ""
echo "    tilt up"
echo ""
echo "  Postgres         localhost:5433   (admin/admin, db: sysdesign)"
echo "  Qdrant           localhost:6333"
echo "  API              localhost:3000/api"
echo "  Quality loop     localhost:3003/health"
echo "  Govcon           localhost:3004/health"
echo "  Frontend         localhost:4200"
echo "  Quality loop UI  localhost:4201"
echo "  Govcon UI        localhost:4202"
echo ""
