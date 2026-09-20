#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f blockchain/.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source blockchain/.env
  set +a
fi

network="${HASHKEY_NETWORK:-testnet}"
case "$network" in
  testnet)
    default_rpc='https://testnet.hsk.xyz'
    default_chain_id=133
    ;;
  mainnet)
    default_rpc='https://mainnet.hsk.xyz'
    default_chain_id=177
    ;;
  *)
    printf 'HASHKEY_NETWORK debe ser testnet o mainnet.\n' >&2
    exit 2
    ;;
esac

rpc_url="${HASHKEY_RPC_URL:-$default_rpc}"
expected_chain_id="${HASHKEY_CHAIN_ID:-$default_chain_id}"
node --input-type=module - "$rpc_url" "$expected_chain_id" <<'NODE'
import { JsonRpcProvider } from 'ethers';

const [rpcUrl, expectedValue] = process.argv.slice(2);
const provider = new JsonRpcProvider(rpcUrl);
const [network, blockNumber] = await Promise.all([
  provider.getNetwork(),
  provider.getBlockNumber(),
]);
const expectedChainId = BigInt(expectedValue);
if (network.chainId !== expectedChainId) {
  throw new Error(`chainId inesperado: recibidos ${network.chainId}, esperados ${expectedChainId}.`);
}
console.log(`HSKChain disponible: chainId=${network.chainId} bloque=${blockNumber} RPC=${rpcUrl}`);
await provider.destroy();
NODE
