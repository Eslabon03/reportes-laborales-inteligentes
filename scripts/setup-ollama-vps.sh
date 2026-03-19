#!/usr/bin/env bash

set -euo pipefail

MODEL="${1:-llama3.2:latest}"
PORT="${OLLAMA_PORT:-11434}"
BIND_HOST="${OLLAMA_BIND_HOST:-0.0.0.0}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Este script debe ejecutarse como root en el VPS." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt update
apt install -y curl ufw

if ! command -v ollama >/dev/null 2>&1; then
  curl -fsSL https://ollama.com/install.sh | sh
fi

mkdir -p /etc/systemd/system/ollama.service.d
cat >/etc/systemd/system/ollama.service.d/override.conf <<EOF
[Service]
Environment="OLLAMA_HOST=${BIND_HOST}:${PORT}"
EOF

systemctl daemon-reload
systemctl enable --now ollama
systemctl restart ollama

ollama pull "${MODEL}"

ufw allow OpenSSH
ufw allow "${PORT}/tcp"
ufw --force enable

echo "\nOllama configurado. Validando estado..."
systemctl status ollama --no-pager -l | sed -n '1,20p'
ss -ltnp | grep ":${PORT}"
curl -fsS "http://127.0.0.1:${PORT}/api/tags" | head -c 200
echo