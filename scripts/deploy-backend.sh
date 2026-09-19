#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f backend/.env ]]; then
  printf 'Falta backend/.env. Copia backend/.env.example y completa los secretos.\n' >&2
  exit 1
fi

required_vars=(BLOCKCHAIN_WS_URL AUREO_CORE_ADDRESS XAI_API_KEY)
missing=()
set -a
# shellcheck disable=SC1091
source backend/.env
set +a
for variable in "${required_vars[@]}"; do
  if [[ -z "${!variable:-}" ]]; then
    missing+=("$variable")
  fi
done
if (( ${#missing[@]} > 0 )); then
  printf 'Variables obligatorias ausentes en backend/.env: %s\n' "${missing[*]}" >&2
  exit 1
fi

npm ci
npm run lint
exec npm --workspace backend run start

