#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="aureo-backend"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

if [[ "${EUID}" -ne 0 ]]; then
  printf 'Este script debe ejecutarse como root (sudo).\n' >&2
  exit 1
fi

if [[ ! -f "${ROOT_DIR}/backend/.env" ]]; then
  printf 'Falta backend/.env; configúralo antes de instalar el servicio.\n' >&2
  exit 1
fi

install -m 0644 "${ROOT_DIR}/deploy/systemd/aureo-backend.service" "$SERVICE_PATH"
sed -i "s|__AUREO_ROOT__|${ROOT_DIR}|g" "$SERVICE_PATH"
systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"
systemctl --no-pager --full status "$SERVICE_NAME"

