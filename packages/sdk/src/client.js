import { ethers } from 'ethers';
import { createEthereumMonitor } from './monitor.js';
import { evaluateEthereumPolicy } from './policy.js';
import { createEthereumSigner } from './wallet.js';

/**
 * Creates a configured Áureo client for common EVM integrations.
 *
 * @param {{
 *   rpcUrl: string,
 *   wsRpcUrl?: string,
 *   contractAddress?: string,
 *   abi?: ethers.InterfaceAbi,
 *   privateKey?: string,
 *   publicAddress?: string
 * }} options
 */
export function createAureoClient(options) {
  if (!options || typeof options !== 'object') {
    throw new Error('La configuración del cliente es obligatoria.');
  }
  if (!options.rpcUrl) throw new Error('rpcUrl es obligatorio.');
  if (options.contractAddress && !ethers.isAddress(options.contractAddress)) {
    throw new Error('contractAddress debe ser una dirección Ethereum válida.');
  }

  const provider = new ethers.JsonRpcProvider(options.rpcUrl);
  const configuredSigner = createEthereumSigner(provider, options);
  const signer = configuredSigner?.signer ?? null;
  const address = configuredSigner?.address ?? null;
  const contract = options.contractAddress && options.abi
    ? new ethers.Contract(options.contractAddress, options.abi, signer ?? provider)
    : null;
  let monitor;

  return {
    provider,
    signer,
    address,
    contract,
    evaluatePolicy: evaluateEthereumPolicy,
    getMonitor() {
      if (!options.wsRpcUrl) throw new Error('wsRpcUrl es obligatorio para crear el monitor.');
      if (!options.contractAddress || !options.abi) {
        throw new Error('contractAddress y abi son obligatorios para crear el monitor.');
      }
      monitor ??= createEthereumMonitor({
        rpcUrl: options.wsRpcUrl,
        contractAddress: options.contractAddress,
        abi: options.abi,
      });
      return monitor;
    },
    subscribe(eventName, handler) {
      return this.getMonitor().subscribe(eventName, handler);
    },
    async close() {
      if (monitor) await monitor.close();
      await provider.destroy();
    },
  };
}
