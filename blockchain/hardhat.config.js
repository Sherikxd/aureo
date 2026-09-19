import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-ignition';
import 'dotenv/config';

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

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
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
};
