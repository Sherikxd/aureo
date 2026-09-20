import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-ignition';
import 'dotenv/config';
import { Wallet } from 'ethers';

const privateKey =
  process.env.AUREO_LOCAL_DEFAULT_ACCOUNT === 'true'
    ? undefined
    : process.env.DEPLOYER_PRIVATE_KEY;
if (
  privateKey &&
  process.env.DEPLOYER_PUBLIC_ADDRESS &&
  new Wallet(privateKey).address.toLowerCase() !== process.env.DEPLOYER_PUBLIC_ADDRESS.toLowerCase()
) {
  throw new Error('DEPLOYER_PUBLIC_ADDRESS no coincide con DEPLOYER_PRIVATE_KEY.');
}

const hashKeyPresets = {
  testnet: { rpcUrl: 'https://testnet.hsk.xyz', chainId: 133 },
  mainnet: { rpcUrl: 'https://mainnet.hsk.xyz', chainId: 177 },
};
const selectedHashKey = hashKeyPresets[process.env.HASHKEY_NETWORK ?? 'testnet'];
const hashKeyRpcUrl = process.env.HASHKEY_RPC_URL ?? selectedHashKey?.rpcUrl;
const hashKeyChainId = process.env.HASHKEY_CHAIN_ID ?? selectedHashKey?.chainId;
const hashKeyNetwork = hashKeyRpcUrl && hashKeyChainId
  ? {
      url: hashKeyRpcUrl,
      chainId: parseChainId(hashKeyChainId),
      ...(privateKey ? { accounts: [privateKey] } : {}),
    }
  : {};

/** @type import('hardhat/config').HardhatUserConfig */
export default {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    localhost: {
      url: process.env.HARDHAT_RPC_URL || 'http://127.0.0.1:8545',
      ...(privateKey ? { accounts: [privateKey] } : {}),
    },
    ...(Object.keys(hashKeyNetwork).length ? { hashkey: hashKeyNetwork } : {}),
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
};

function parseChainId(value) {
  const chainId = Number(value);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error('HASHKEY_CHAIN_ID debe ser un entero positivo.');
  }
  return chainId;
}
