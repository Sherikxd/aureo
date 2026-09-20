#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WITH_CLI=false

for argument in "$@"; do
  case "$argument" in
    --with-cli) WITH_CLI=true ;;
    *)
      printf 'Uso: npm run start:local [-- --with-cli]\n' >&2
      exit 2
      ;;
  esac
done

cd "$ROOT_DIR"

if [[ ! -f backend/.env ]]; then
  printf 'Falta backend/.env. Ejecuta npm run setup:env y completa sus valores.\n' >&2
  exit 1
fi

runtime_file="$(mktemp "${TMPDIR:-/tmp}/aureo-backend.XXXXXX.env")"
pid_file="$ROOT_DIR/.runtime/local-stack.pids"
blockchain_pid=''
backend_pid=''
cli_pid=''
mkdir -p "$ROOT_DIR/.runtime"
printf '%s\n' "$$" > "$pid_file"

stop_process() {
  local pid="$1"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    wait "$pid" 2>/dev/null || true
  fi
}

cleanup() {
  stop_process "$cli_pid"
  stop_process "$backend_pid"
  stop_process "$blockchain_pid"
  rm -f "$runtime_file"
  rm -f "$pid_file"
}
trap cleanup EXIT INT TERM

printf 'Iniciando nodo Hardhat...\n'
npm --workspace blockchain run node -- --hostname 127.0.0.1 &
blockchain_pid=$!
printf 'blockchain=%s\n' "$blockchain_pid" >> "$pid_file"

printf 'Esperando RPC en 127.0.0.1:8545...\n'
for attempt in {1..30}; do
  if node --input-type=module -e \
    "const { JsonRpcProvider } = await import('ethers'); await new JsonRpcProvider('http://127.0.0.1:8545').getBlockNumber();" \
    >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$blockchain_pid" 2>/dev/null; then
    printf 'El nodo Hardhat terminó antes de estar disponible.\n' >&2
    exit 1
  fi
  if (( attempt == 30 )); then
    printf 'Tiempo de espera agotado para el nodo Hardhat.\n' >&2
    exit 1
  fi
  sleep 1
done

printf 'Desplegando AureoCore...\n'
AUREO_RUNTIME_ENV="$runtime_file" AUREO_LOCAL_DEFAULT_ACCOUNT=true npm run deploy:blockchain

set -a
# shellcheck disable=SC1091
source backend/.env
# shellcheck disable=SC1091
source "$runtime_file"
set +a
export BLOCKCHAIN_WS_URL="${BLOCKCHAIN_WS_URL:-ws://127.0.0.1:8545}"

printf 'Iniciando backend en http://127.0.0.1:%s...\n' "${BACKEND_PORT:-3000}"
npm --workspace backend run start &
backend_pid=$!
printf 'backend=%s\n' "$backend_pid" >> "$pid_file"

backend_port="${BACKEND_PORT:-3000}"
printf 'Esperando backend en 127.0.0.1:%s...\n' "$backend_port"
for attempt in {1..30}; do
  if node --input-type=module -e \
    "const response = await fetch('http://127.0.0.1:' + process.argv[1] + '/health'); if (!response.ok) process.exit(1);" \
    "$backend_port" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$backend_pid" 2>/dev/null; then
    printf 'El backend terminó antes de estar disponible.\n' >&2
    exit 1
  fi
  if (( attempt == 30 )); then
    printf 'Tiempo de espera agotado para el backend.\n' >&2
    exit 1
  fi
  sleep 1
done

if [[ "$WITH_CLI" == true ]]; then
  if [[ -f cli-client/.env ]]; then
    set -a
    # shellcheck disable=SC1091
    source cli-client/.env
    set +a
  fi
  export AUREO_BACKEND_URL="${AUREO_BACKEND_URL:-http://127.0.0.1:3000}"
  export AUREO_STREAM_URL="${AUREO_STREAM_URL:-ws://127.0.0.1:3000/stream}"
  printf 'Iniciando CLI en modo stream...\n'
  npm --workspace cli-client run start -- stream &
  cli_pid=$!
  printf 'cli=%s\n' "$cli_pid" >> "$pid_file"
fi

printf 'Entorno local iniciado. Presiona Ctrl+C para detener todos los procesos.\n'
wait "$backend_pid"
