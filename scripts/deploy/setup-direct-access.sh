#!/usr/bin/env bash
# Revert to direct VPS access: provider maps public :20063 → app :3000 (no Caddy).
set -euo pipefail

echo "==> Stopping Caddy (optional HTTPS reverse proxy)"
if systemctl is-active caddy >/dev/null 2>&1; then
  systemctl stop caddy
fi
systemctl disable caddy 2>/dev/null || true

echo "==> Ensuring alpha-trader-api is enabled"
systemctl enable alpha-trader-api
systemctl restart alpha-trader-api
sleep 2
systemctl is-active alpha-trader-api

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