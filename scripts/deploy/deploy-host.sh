#!/usr/bin/env bash
# Full deploy on the VPS host (outside Jenkins).
# Usage: bash scripts/deploy/deploy-host.sh
# Optional: APP_ROOT=/opt/alpha-trader bash scripts/deploy/deploy-host.sh
set -euo pipefail

ROOT="${APP_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$ROOT"

echo "==> Deploy from $ROOT"

if [[ -d .git ]]; then
  echo "==> git pull"
  git pull --ff-only
else
  echo "warn: not a git repo — skipping git pull" >&2
fi

if [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "error: node not found (install Node 22 or load nvm)" >&2
  exit 1
fi

echo "==> node $(node --version)"

if [[ -f package-lock.json ]]; then
  echo "==> npm ci"
  npm ci --legacy-peer-deps --include=dev
else
  echo "==> npm install"
  npm install --legacy-peer-deps
fi

echo "==> npm test"
npm test

echo "==> npm run build"
npm run build

if command -v systemctl >/dev/null 2>&1 && systemctl cat alpha-trader-api.service >/dev/null 2>&1; then
  echo "==> systemctl restart alpha-trader-api"
  systemctl restart alpha-trader-api
  systemctl is-active alpha-trader-api
else
  echo "==> restart-services.sh"
  bash scripts/deploy/restart-services.sh
fi

echo "==> Deploy complete"