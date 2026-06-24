#!/usr/bin/env bash
# Restart Alpha Trader after a successful build.
# Default: single process on :3000 serving API + Angular (SERVE_WEB_APP=true).
# Set SERVE_WEB_APP=false in .env to use the split-port layout (API :3000, web :4000).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

RUN_DIR="${RUN_DIR:-$ROOT/.run}"
API_PID_FILE="$RUN_DIR/api.pid"
WEB_PID_FILE="$RUN_DIR/web.pid"
API_LOG="$RUN_DIR/api.log"
WEB_LOG="$RUN_DIR/web.log"

mkdir -p "$RUN_DIR"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-3000}"
export NODE_ENV="${NODE_ENV:-production}"
export SERVE_WEB_APP="${SERVE_WEB_APP:-true}"

resolve_node_bin() {
  if [[ -n "${NODE_BIN:-}" && -x "$NODE_BIN" ]]; then
    return 0
  fi
  if command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
    return 0
  fi
  local nvm_dir="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$nvm_dir/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    . "$nvm_dir/nvm.sh"
    NODE_BIN="$(command -v node || true)"
  fi
  [[ -n "${NODE_BIN:-}" ]]
}

if ! resolve_node_bin; then
  echo "node not found (install Node or set NODE_BIN)" >&2
  exit 1
fi

API_ENTRY="$ROOT/apps/alpha-trader-server/dist/main.js"
WEB_ROOT="$ROOT/dist/apps/alpha-trader-web/browser"

if [[ ! -f "$API_ENTRY" ]]; then
  echo "Missing API build: $API_ENTRY (run npm run build:server first)" >&2
  exit 1
fi

if [[ "$SERVE_WEB_APP" == "true" && ! -f "$WEB_ROOT/index.html" ]]; then
  echo "Missing web build: $WEB_ROOT/index.html (run npm run build:web first)" >&2
  exit 1
fi

stop_pid() {
  local pidfile="$1"
  local name="$2"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid="$(cat "$pidfile")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping $name (pid $pid)…"
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile"
  fi
}

stop_pid "$API_PID_FILE" "alpha-trader"
stop_pid "$WEB_PID_FILE" "alpha-trader-web"

if [[ "$SERVE_WEB_APP" == "true" ]]; then
  echo "Starting alpha-trader (API + web) on ${HOST}:${PORT}…"
  nohup "$NODE_BIN" "$API_ENTRY" >>"$API_LOG" 2>&1 &
  echo $! >"$API_PID_FILE"
else
  echo "Starting alpha-trader API on ${HOST}:${PORT}…"
  nohup "$NODE_BIN" "$API_ENTRY" >>"$API_LOG" 2>&1 &
  echo $! >"$API_PID_FILE"

  echo "Starting alpha-trader web on 0.0.0.0:4000…"
  HOST=0.0.0.0 PORT=4000 API_PROXY_TARGET="http://127.0.0.1:${PORT}" \
    nohup "$NODE_BIN" "$ROOT/scripts/serve-frontend.mjs" >>"$WEB_LOG" 2>&1 &
  echo $! >"$WEB_PID_FILE"
fi

sleep 2

if ! kill -0 "$(cat "$API_PID_FILE")" 2>/dev/null; then
  echo "Process failed to start. Tail of $API_LOG:" >&2
  tail -n 40 "$API_LOG" >&2 || true
  exit 1
fi

if [[ "$SERVE_WEB_APP" != "true" ]] && ! kill -0 "$(cat "$WEB_PID_FILE")" 2>/dev/null; then
  echo "Web failed to start. Tail of $WEB_LOG:" >&2
  tail -n 40 "$WEB_LOG" >&2 || true
  exit 1
fi

echo "Deploy complete."
if [[ "$SERVE_WEB_APP" == "true" ]]; then
  echo "  App (API + web): http://${HOST}:${PORT}"
else
  echo "  API: http://${HOST}:${PORT}"
  echo "  Web: http://0.0.0.0:4000"
fi
echo "  Logs: $API_LOG"