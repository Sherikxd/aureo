#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NETWORK="${1:-localhost}"
requested_local_default="${AUREO_LOCAL_DEFAULT_ACCOUNT:-}"

cd "$ROOT_DIR"

if [[ -f blockchain/.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source blockchain/.env
  set +a
fi

if [[ "$NETWORK" == "localhost" ]]; then
  if [[ "$requested_local_default" == true ]]; then
    export AUREO_LOCAL_DEFAULT_ACCOUNT=true
  fi
  # Hardhat's local node funds its generated accounts, not a wallet from .env.
  # Set AUREO_LOCAL_DEFAULT_ACCOUNT=false to deploy with a funded custom wallet.
  export AUREO_LOCAL_DEFAULT_ACCOUNT="${AUREO_LOCAL_DEFAULT_ACCOUNT:-true}"
  if [[ "${AUREO_LOCAL_DEFAULT_ACCOUNT:-false}" == true ]]; then
    unset DEPLOYER_PRIVATE_KEY DEPLOYER_PUBLIC_ADDRESS
  fi
  printf 'Verificando nodo Hardhat en 127.0.0.1:8545...\n'
  node --input-type=module -e "const { JsonRpcProvider } = await import('ethers'); const p = new JsonRpcProvider(process.env.HARDHAT_RPC_URL || 'http://127.0.0.1:8545'); await p.getBlockNumber();" || {
    printf 'No hay un nodo local disponible. Ejecuta: npm --workspace blockchain run node\n' >&2
    exit 1
  }
elif [[ "$NETWORK" == "hashkey" ]]; then
  if [[ -z "${HASHKEY_RPC_URL:-}" && "${HASHKEY_NETWORK:-}" == "testnet" ]]; then
    export HASHKEY_RPC_URL=https://testnet.hsk.xyz
  elif [[ -z "${HASHKEY_RPC_URL:-}" && "${HASHKEY_NETWORK:-}" == "mainnet" ]]; then
    export HASHKEY_RPC_URL=https://mainnet.hsk.xyz
  fi
  if [[ -z "${HASHKEY_CHAIN_ID:-}" && "${HASHKEY_NETWORK:-}" == "testnet" ]]; then
    export HASHKEY_CHAIN_ID=133
  elif [[ -z "${HASHKEY_CHAIN_ID:-}" && "${HASHKEY_NETWORK:-}" == "mainnet" ]]; then
    export HASHKEY_CHAIN_ID=177
  fi
  if [[ -z "${HASHKEY_RPC_URL:-}" || -z "${HASHKEY_CHAIN_ID:-}" ]]; then
    printf 'HASHKEY_NETWORK debe ser testnet o mainnet, o define RPC y chain ID.\n' >&2
    exit 1
  fi
  if [[ -z "${DEPLOYER_PRIVATE_KEY:-}" || "${AUREO_LOCAL_DEFAULT_ACCOUNT:-false}" == true ]]; then
    printf 'Configura DEPLOYER_PRIVATE_KEY y AUREO_LOCAL_DEFAULT_ACCOUNT=false para HashKey.\n' >&2
    exit 1
  fi
fi

npm --workspace blockchain run compile
if [[ "$NETWORK" == "localhost" ]]; then
  npm --workspace blockchain run deploy:local
else
  npm --workspace blockchain exec -- hardhat ignition deploy ignition/modules/AureoCore.js --network "$NETWORK"
fi

if [[ -n "${AUREO_RUNTIME_ENV:-}" ]]; then
  deployment_chain_id=31337
  if [[ "$NETWORK" == "hashkey" ]]; then
    deployment_chain_id="$HASHKEY_CHAIN_ID"
  fi
  address="$(
    node --input-type=module -e "
      import { readFileSync } from 'node:fs';
      const chainId = process.argv[1];
      const file = \`blockchain/ignition/deployments/chain-\${chainId}/deployed_addresses.json\`;
      const deployed = JSON.parse(readFileSync(file, 'utf8'));
      process.stdout.write(deployed['AureoCoreModule#AureoCore'] ?? '');
    " "$deployment_chain_id"
  )"
  if [[ -z "$address" ]]; then
    printf 'No se pudo resolver la dirección desplegada de AureoCore.\n' >&2
    exit 1
  fi
  mkdir -p "$(dirname "$AUREO_RUNTIME_ENV")"
  printf 'AUREO_CORE_ADDRESS=%s\n' "$address" > "$AUREO_RUNTIME_ENV"
  printf 'Contrato desplegado en %s\n' "$address"
fi
