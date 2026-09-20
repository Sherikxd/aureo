import { createAureoClient } from '@aureo/sdk';

const rpcUrl = process.env.HASHKEY_RPC_URL ?? 'https://testnet.hsk.xyz';
const expectedChainId = BigInt(process.env.HASHKEY_CHAIN_ID ?? 133);
const contractAddress = process.env.AUREO_CORE_ADDRESS;

if (!contractAddress) {
  throw new Error('Define AUREO_CORE_ADDRESS con el contrato desplegado en HSKChain.');
}

const client = createAureoClient({ rpcUrl, contractAddress, abi: [] });
try {
  const network = await client.provider.getNetwork();
  const code = await client.provider.getCode(contractAddress);
  if (network.chainId !== expectedChainId) {
    throw new Error(`chainId inesperado: ${network.chainId}; esperado: ${expectedChainId}.`);
  }
  if (code === '0x') throw new Error('No hay bytecode en AUREO_CORE_ADDRESS.');
  console.log(JSON.stringify({
    network: network.chainId.toString(),
    rpcUrl,
    contractAddress,
    contractDeployed: true,
    metrics: client.metrics.snapshot(),
  }, null, 2));
} finally {
  await client.close();
}
