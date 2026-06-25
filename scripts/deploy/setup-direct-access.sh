#!/usr/bin/env bash
# Revert to direct VPS access: provider maps public :20063 → app :3000 (no Caddy).
set -euo pipefail

echo "==> Stopping Caddy (optional HTTPS reverse proxy)"
if systemctl is-active caddy >/dev/null 2>&1; then
  systemctl stop caddy
fi
systemctl disable caddy 2>/dev/null || true

echo "==> Ensuring alpha-trader-api is enabled"
if [[ ! -s /root/.nvm/nvm.sh ]]; then
  echo "error: install Node 22 first (nvm install 22)" >&2
  exit 1
fi
cp "$(dirname "$0")/alpha-trader-api.service" /etc/systemd/system/alpha-trader-api.service
systemctl daemon-reload
systemctl enable alpha-trader-api
systemctl restart alpha-trader-api

echo "==> Waiting for API on :3000"
ready=0
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/api >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "$ready" != 1 ]]; then
  echo "error: API did not become ready on :3000" >&2
  systemctl status alpha-trader-api --no-pager || true
  journalctl -u alpha-trader-api -n 40 --no-pager || true
  exit 1
fi

echo "==> Local health check"
curl -fsS http://127.0.0.1:3000/api
echo

cat <<'EOF'

Direct access setup (on the VPS provider panel):
  Public  37.187.139.100:20063  →  VM internal IP:3000  (TCP)

Browser:  http://37.187.139.100:20063
Fyers:    FYERS_REDIRECT_URL=http://37.187.139.100:20063/api/access-token

Re-enable Caddy later when trading-bot.in DNS is live (see Caddyfile.example).
EOF