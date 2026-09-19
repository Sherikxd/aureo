#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f examples/demo-dapp/.env ]]; then
  printf 'Falta examples/demo-dapp/.env. Copia el archivo .env.example.\n' >&2
  exit 1
fi

node --input-type=module -e "const { JsonRpcProvider } = await import('ethers'); await new JsonRpcProvider(process.env.HARDHAT_RPC_URL || 'http://127.0.0.1:8545').getBlockNumber();" || {
  printf 'Inicia primero el nodo: npm --workspace blockchain run node\n' >&2
  exit 1
}

runtime_file="$(mktemp)"
cleanup() {
  rm -f "$runtime_file"
}
trap cleanup EXIT

if [[ -f blockchain/.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source blockchain/.env
  set +a
fi

AUREO_RUNTIME_ENV="$runtime_file" bash scripts/deploy-blockchain.sh localhost
set -a
# shellcheck disable=SC1091
source examples/demo-dapp/.env
# shellcheck disable=SC1091
source "$runtime_file"
set +a
if [[ "${AUREO_LOCAL_DEFAULT_ACCOUNT:-true}" == true ]]; then
  export DEMO_PRIVATE_KEY=
  export DEMO_PUBLIC_ADDRESS=
fi
export AUREO_CORE_ADDRESS

npm --workspace @aureo/demo-dapp run start
