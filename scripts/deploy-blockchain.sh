#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NETWORK="${1:-localhost}"

cd "$ROOT_DIR"

if [[ -f blockchain/.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source blockchain/.env
  set +a
fi

if [[ "$NETWORK" == "localhost" ]]; then
  printf 'Verificando nodo Hardhat en 127.0.0.1:8545...\n'
  node --input-type=module -e "const { JsonRpcProvider } = await import('ethers'); const p = new JsonRpcProvider(process.env.HARDHAT_RPC_URL || 'http://127.0.0.1:8545'); await p.getBlockNumber();" || {
    printf 'No hay un nodo local disponible. Ejecuta: npm --workspace blockchain run node\n' >&2
    exit 1
  }
fi

npm --workspace blockchain run compile
if [[ "$NETWORK" == "localhost" ]]; then
  npm --workspace blockchain run deploy:local
else
  npm --workspace blockchain exec -- hardhat ignition deploy ignition/modules/AureoCore.js --network "$NETWORK"
fi

if [[ -n "${AUREO_RUNTIME_ENV:-}" ]]; then
  address="$(
    node --input-type=module -e "
      import { readFileSync } from 'node:fs';
      const file = 'blockchain/ignition/deployments/chain-31337/deployed_addresses.json';
      const deployed = JSON.parse(readFileSync(file, 'utf8'));
      process.stdout.write(deployed['AureoCoreModule#AureoCore'] ?? '');
    "
  )"
  if [[ -z "$address" ]]; then
    printf 'No se pudo resolver la dirección desplegada de AureoCore.\n' >&2
    exit 1
  fi
  mkdir -p "$(dirname "$AUREO_RUNTIME_ENV")"
  printf 'AUREO_CORE_ADDRESS=%s\n' "$address" > "$AUREO_RUNTIME_ENV"
  printf 'Contrato desplegado en %s\n' "$address"
fi
