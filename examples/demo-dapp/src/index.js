import 'dotenv/config';
import { ethers } from 'ethers';
import { createEthereumMonitor, createEthereumSigner, evaluateEthereumPolicy } from '@aureo/sdk';

const contractAbi = [
  'function recordCorporateTransfer(address beneficiary,uint256 amount,bytes32 operationReference) returns (uint256)',
  'event CorporateTransferRecorded(uint256 indexed operationId,address indexed initiator,address indexed beneficiary,uint256 amount,bytes32 operationReference,uint256 timestamp)',
];

const wsRpcUrl = process.env.DEMO_WS_RPC_URL ?? 'ws://127.0.0.1:8545';
const httpRpcUrl = process.env.DEMO_HTTP_RPC_URL ?? 'http://127.0.0.1:8545';
const contractAddress = process.env.AUREO_CORE_ADDRESS;
if (!contractAddress) {
  throw new Error('AUREO_CORE_ADDRESS es obligatorio. Usa npm run demo:run.');
}

const httpProvider = new ethers.JsonRpcProvider(httpRpcUrl);
const configuredSigner = createEthereumSigner(httpProvider, {
  privateKey: process.env.DEMO_PRIVATE_KEY,
  publicAddress: process.env.DEMO_PUBLIC_ADDRESS,
});
const signer = configuredSigner?.signer ?? (await httpProvider.getSigner(0));
const signerAddress = await signer.getAddress();
const defaultBeneficiary = await (await httpProvider.getSigner(1)).getAddress();
const beneficiary = process.env.DEMO_BENEFICIARY || defaultBeneficiary;
if (!ethers.isAddress(beneficiary))
  throw new Error('DEMO_BENEFICIARY debe ser una dirección Ethereum.');
const contract = new ethers.Contract(contractAddress, contractAbi, signer);
const monitor = createEthereumMonitor({
  rpcUrl: wsRpcUrl,
  contractAddress,
  abi: contractAbi,
});

const transfers = [];
const unsubscribe = monitor.subscribe('CorporateTransferRecorded', (event) => {
  const [operationId, initiator, beneficiaryAddress, amount, reference] = event.args;
  const transfer = {
    operationId: operationId.toString(),
    initiator,
    beneficiary: beneficiaryAddress,
    amount: amount.toString(),
    operationReference: reference,
    blockNumber: event.blockNumber,
  };
  transfers.push(transfer);
  const policy = evaluateEthereumPolicy(transfers);
  console.log(JSON.stringify({ type: 'sdk_event', transfer, policy }, null, 2));
});

try {
  console.log(`Demo dapp usando AureoCore en ${contractAddress}`);
  console.log(
    `Signer: ${signerAddress}${configuredSigner ? ' (ETH wallet)' : ' (Hardhat account)'}`,
  );
  console.log(`Enviando ${parseCount(process.env.DEMO_OPERATIONS ?? '4')} operaciones...`);

  const count = parseCount(process.env.DEMO_OPERATIONS ?? '4');
  const amount = parseAmount(process.env.DEMO_AMOUNT ?? '10');
  for (let index = 0; index < count; index += 1) {
    const reference = ethers.encodeBytes32String(`demo-${index + 1}`);
    const transaction = await contract.recordCorporateTransfer(beneficiary, amount, reference);
    await transaction.wait();
    console.log(`Operación ${index + 1}/${count} confirmada: ${transaction.hash}`);
  }

  await waitForEvents(count);
  console.log(
    JSON.stringify(
      {
        status: 'completed',
        contract: contractAddress,
        signer: signerAddress,
        observedEvents: transfers.length,
        speedRuleTriggered: evaluateEthereumPolicy(transfers).speedViolation,
      },
      null,
      2,
    ),
  );
} finally {
  unsubscribe();
  await monitor.close();
  await httpProvider.destroy();
}

function parseCount(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new Error('DEMO_OPERATIONS debe ser un entero entre 1 y 100.');
  }
  return count;
}

function parseAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('DEMO_AMOUNT debe ser positivo.');
  return amount;
}

async function waitForEvents(expected) {
  const deadline = Date.now() + 15_000;
  while (transfers.length < expected && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (transfers.length < expected) {
    throw new Error(`Solo se observaron ${transfers.length}/${expected} eventos por WebSocket.`);
  }
}
