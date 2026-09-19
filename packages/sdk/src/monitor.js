import { ethers } from 'ethers';

/**
 * Creates a reusable event monitor for any EVM contract.
 *
 * @param {{rpcUrl: string, contractAddress: string, abi: ethers.InterfaceAbi}} options
 */
export function createEthereumMonitor({ rpcUrl, contractAddress, abi }) {
  if (!rpcUrl || !contractAddress || !abi) {
    throw new Error('rpcUrl, contractAddress y abi son obligatorios.');
  }
  const provider = new ethers.WebSocketProvider(rpcUrl);
  const contract = new ethers.Contract(contractAddress, abi, provider);

  return {
    provider,
    contract,
    /**
     * @param {string} eventName
     * @param {(payload: object) => void} handler
     * @returns {() => void}
     */
    subscribe(eventName, handler) {
      if (typeof handler !== 'function') throw new Error('handler debe ser una función.');
      const listener = (...args) => {
        const log = args.at(-1);
        handler({
          eventName,
          args: args.slice(0, -1),
          blockNumber: log?.blockNumber ?? log?.log?.blockNumber,
          transactionHash: log?.transactionHash ?? log?.log?.transactionHash,
        });
      };
      contract.on(eventName, listener);
      return () => contract.off(eventName, listener);
    },
    async close() {
      contract.removeAllListeners();
      await provider.destroy();
    },
  };
}
