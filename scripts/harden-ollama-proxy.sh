#!/usr/bin/env bash

set -euo pipefail

MODEL="${OLLAMA_MODEL:-${1:-llama3.2:latest}}"
PUBLIC_HOST="${PUBLIC_HOST:-${2:-$(hostname -I | awk '{print $1}')}}"
UPSTREAM_PORT="${OLLAMA_UPSTREAM_PORT:-11434}"
PROXY_PORT="${OLLAMA_PROXY_PORT:-11435}"
TOKEN_DIR="/etc/ollama-proxy"
TOKEN_FILE="${TOKEN_DIR}/token"
ROTATE_TOKEN="${ROTATE_OLLAMA_PROXY_TOKEN:-0}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Este script debe ejecutarse como root en el VPS." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

retry() {
  local attempts="$1"
  local delay_seconds="$2"
  shift 2

  local count=1
  while true; do
    if "$@"; then
      return 0
    fi
    if [[ "$count" -ge "$attempts" ]]; then
      return 1
    fi
    sleep "$delay_seconds"
    count=$((count + 1))
  done
}

MISSING_CMDS=()
for cmd in curl ufw nginx openssl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    MISSING_CMDS+=("$cmd")
  fi
done

if [[ "${#MISSING_CMDS[@]}" -gt 0 ]]; then
  retry 5 5 apt update
  retry 5 5 apt install -y "${MISSING_CMDS[@]}"
fi

if ! command -v ollama >/dev/null 2>&1; then
  curl -fsSL https://ollama.com/install.sh | sh
fi

mkdir -p /etc/systemd/system/ollama.service.d
cat >/etc/systemd/system/ollama.service.d/override.conf <<EOF
[Service]
Environment="OLLAMA_HOST=127.0.0.1:${UPSTREAM_PORT}"
EOF

systemctl daemon-reload
systemctl enable --now ollama
systemctl restart ollama

retry 10 3 curl -fsS "http://127.0.0.1:${UPSTREAM_PORT}/api/tags" >/dev/null

if ! retry 3 5 ollama pull "${MODEL}"; then
  if [[ "${MODEL}" == *":latest" ]]; then
    FALLBACK_MODEL="${MODEL%:latest}"
    retry 3 5 ollama pull "${FALLBACK_MODEL}"
    MODEL="${FALLBACK_MODEL}"
  else
    echo "No se pudo descargar el modelo ${MODEL}." >&2
    exit 1
  fi
fi

install -d -m 700 "${TOKEN_DIR}"

if [[ -s "${TOKEN_FILE}" && "${ROTATE_TOKEN}" != "1" ]]; then
  TOKEN="$(<"${TOKEN_FILE}")"
else
  TOKEN="$(openssl rand -hex 32)"
  printf '%s' "${TOKEN}" >"${TOKEN_FILE}"
  chmod 600 "${TOKEN_FILE}"
fi

cat >/etc/nginx/conf.d/ollama-proxy.conf <<EOF
server {
  listen ${PROXY_PORT};
  server_name _;

  location / {
    if (\$http_authorization != "Bearer ${TOKEN}") { return 401; }
    proxy_pass http://127.0.0.1:${UPSTREAM_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header Connection "";
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
  }
}
EOF

nginx -t
systemctl enable --now nginx
systemctl restart nginx

ufw allow OpenSSH
ufw allow "${PROXY_PORT}/tcp"
ufw delete allow "${UPSTREAM_PORT}/tcp" || true
ufw --force enable

retry 15 2 curl -fsS -H "Authorization: Bearer ${TOKEN}" "http://127.0.0.1:${PROXY_PORT}/api/tags" >/dev/null

printf '{"ollamaHost":"http://%s:%s","ollamaApiKey":"%s","ollamaModel":"%s"}\n' "${PUBLIC_HOST}" "${PROXY_PORT}" "${TOKEN}" "${MODEL}"
