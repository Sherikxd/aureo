#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CASE="${1:-normal}"

case "$CASE" in
  normal|speed|volume) ;;
  *)
    printf 'Uso: npm run demo:case -- [normal|speed|volume]\n' >&2
    exit 2
    ;;
esac

cd "$ROOT_DIR"

node --input-type=module -e \
  "const { JsonRpcProvider } = await import('ethers'); await new JsonRpcProvider(process.env.HARDHAT_RPC_URL || 'http://127.0.0.1:8545').getBlockNumber();" \
  >/dev/null || {
  printf 'Inicia primero el nodo: npm --workspace blockchain run node\n' >&2
  exit 1
}

runtime_file="$(mktemp)"
cleanup() { rm -f "$runtime_file"; }
trap cleanup EXIT

AUREO_RUNTIME_ENV="$runtime_file" AUREO_LOCAL_DEFAULT_ACCOUNT=true bash scripts/deploy-blockchain.sh localhost
set -a
# shellcheck disable=SC1091
source "$runtime_file"
set +a
AUREO_CORE_ADDRESS="$AUREO_CORE_ADDRESS" AUREO_DEMO_CASE="$CASE" node examples/cases/runner.mjs
