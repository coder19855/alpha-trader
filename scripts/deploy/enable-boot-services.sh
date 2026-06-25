#!/usr/bin/env bash
# Run once on the VPS so Alpha Trader survives reboot.
set -euo pipefail

echo "==> Enable Docker"
systemctl enable docker
systemctl start docker

for name in alpha-trader-mongo jenkins; do
  if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
    echo "==> Docker restart policy: $name"
    docker update --restart unless-stopped "$name" >/dev/null
    docker start "$name" >/dev/null 2>&1 || true
  fi
done

echo "==> Enable alpha-trader-api (Node 22 via nvm)"
cp "$(dirname "$0")/alpha-trader-api.service" /etc/systemd/system/alpha-trader-api.service
systemctl daemon-reload
systemctl enable alpha-trader-api
systemctl restart alpha-trader-api

echo "==> Caddy stays disabled until trading-bot.in is ready"
systemctl disable caddy 2>/dev/null || true
systemctl stop caddy 2>/dev/null || true

sleep 3
if curl -fsS http://127.0.0.1:3000/api >/dev/null; then
  echo "==> API ready on :3000"
  curl -fsS http://127.0.0.1:3000/api
  echo
else
  echo "warn: API not responding yet — check: journalctl -u alpha-trader-api -n 30" >&2
  exit 1
fi

echo "==> Enabled for boot:"
systemctl is-enabled docker alpha-trader-api
docker ps --format 'table {{.Names}}\t{{.Status}}'