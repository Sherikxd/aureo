import { ethers } from 'ethers';
import { createEthereumMonitor } from './monitor.js';
import { evaluateEthereumPolicy } from './policy.js';
import { createEthereumSigner } from './wallet.js';
import { createMetrics } from './metrics.js';

/**
 * Creates a configured Áureo client for common EVM integrations.
 *
 * @param {{
 *   rpcUrl: string,
 *   wsRpcUrl?: string,
 *   contractAddress?: string,
 *   abi?: ethers.InterfaceAbi,
 *   privateKey?: string,
 *   publicAddress?: string,
 *   signer?: ethers.Signer
 *   speedThreshold?: number,
 *   speedBlockWindow?: number,
 *   volumeMultiplier?: number
 *   emaAlpha?: number
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
  const configuredSigner = options.signer
    ? { signer: options.signer, address: null }
    : createEthereumSigner(provider, options);
  const signer = configuredSigner?.signer ?? null;
  const address = configuredSigner?.address ?? null;
  const contract = options.contractAddress && options.abi
    ? new ethers.Contract(options.contractAddress, options.abi, signer ?? provider)
    : null;
  let monitor;
  const metrics = createMetrics({
    speedThreshold: options.speedThreshold,
    speedBlockWindow: options.speedBlockWindow,
    volumeMultiplier: options.volumeMultiplier,
    emaAlpha: options.emaAlpha,
  });

  return {
    provider,
    signer,
    address,
    contract,
    metrics,
    evaluatePolicy: evaluateEthereumPolicy,
    recordCorporateTransfer: async (beneficiary, amount, operationReference) => {
      if (!contract || !signer) throw new Error('Se requiere un contrato y signer para registrar transferencias.');
      const transaction = await contract.recordCorporateTransfer(
        beneficiary,
        amount,
        operationReference,
      );
      const receipt = await transaction.wait();
      const event = receipt.logs
        .map((log) => {
          try {
            return contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed?.name === 'CorporateTransferRecorded');
      const transfer = {
        operationId: (event?.args.operationId ?? 0n).toString(),
        initiator: event?.args.initiator ?? await signer.getAddress(),
        beneficiary: event?.args.beneficiary ?? beneficiary,
        amount: (event?.args.amount ?? amount).toString(),
        operationReference: event?.args.operationReference ?? operationReference,
        blockNumber: receipt.blockNumber,
        transactionHash: receipt.hash,
      };
      const policy = metrics.recordTransfer(transfer);
      return { transfer, policy, metrics: metrics.snapshot() };
    },
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
