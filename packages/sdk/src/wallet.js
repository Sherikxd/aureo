import { ethers } from 'ethers';

/**
 * Creates a signer without exposing the private key to callers.
 *
 * @param {ethers.Provider} provider
 * @param {{privateKey?: string, publicAddress?: string}} [options]
 * @returns {{signer: ethers.Wallet, address: string}|null}
 */
export function createEthereumSigner(provider, options = {}) {
  const privateKey = options.privateKey ?? process.env.ETH_PRIVATE_KEY;
  const publicAddress = options.publicAddress ?? process.env.ETH_PUBLIC_ADDRESS;

  if (!privateKey) {
    if (publicAddress) {
      throw new Error('ETH_PUBLIC_ADDRESS requiere ETH_PRIVATE_KEY.');
    }
    return null;
  }

  let signer;
  try {
    signer = new ethers.Wallet(privateKey, provider);
  } catch (error) {
    throw new Error(`Clave privada Ethereum inválida: ${error.message}`, { cause: error });
  }

  if (publicAddress && signer.address.toLowerCase() !== publicAddress.toLowerCase()) {
    throw new Error('ETH_PUBLIC_ADDRESS no coincide con la clave privada.');
  }
  return { signer, address: signer.address };
}
