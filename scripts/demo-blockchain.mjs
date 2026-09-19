import { ethers } from 'ethers';

const rpcUrl = process.env.HARDHAT_RPC_URL ?? 'http://127.0.0.1:8545';
const contractAddress = process.env.AUREO_CORE_ADDRESS;

if (!contractAddress) {
  throw new Error(
    'AUREO_CORE_ADDRESS es obligatorio. Despliega primero con npm run deploy:blockchain.',
  );
}

const abi = [
  'function OPERATOR_ROLE() view returns (bytes32)',
  'function COMPLIANCE_ROLE() view returns (bytes32)',
  'function grantRole(bytes32 role,address account)',
  'function recordCorporateTransfer(address beneficiary,uint256 amount,bytes32 operationReference) returns (uint256)',
  'function startAlert(bytes32 operationReference,uint8 riskLevel,string reason) returns (uint256)',
  'function getCorporateTransfer(uint256 operationId) view returns (tuple(address initiator,address beneficiary,uint256 amount,bytes32 operationReference,uint256 timestamp))',
  'function getAlert(uint256 alertId) view returns (tuple(bytes32 operationReference,uint8 riskLevel,string reason,address initiator,uint256 timestamp))',
  'function pause()',
  'function unpause()',
  'function paused() view returns (bool)',
  'event CorporateTransferRecorded(uint256 indexed operationId,address indexed initiator,address indexed beneficiary,uint256 amount,bytes32 operationReference,uint256 timestamp)',
  'event AlertStarted(uint256 indexed alertId,bytes32 indexed operationReference,uint8 riskLevel,string reason,uint256 timestamp)',
];

const provider = new ethers.JsonRpcProvider(rpcUrl);
const [admin, beneficiary] = await Promise.all([provider.getSigner(0), provider.getSigner(1)]);
const adminAddress = await admin.getAddress();
const beneficiaryAddress = await beneficiary.getAddress();
const contract = new ethers.Contract(contractAddress, abi, admin);

const operatorRole = await contract.OPERATOR_ROLE();
const complianceRole = await contract.COMPLIANCE_ROLE();
await waitFor(contract.grantRole(operatorRole, adminAddress));
await waitFor(contract.grantRole(complianceRole, adminAddress));
if (await contract.paused()) {
  await waitFor(contract.unpause());
}

const reference = ethers.encodeBytes32String(`demo-${Date.now()}`);
const transferReceipt = await waitFor(
  contract.recordCorporateTransfer(beneficiaryAddress, 25_000n, reference),
);
const transferEvent = transferReceipt.logs
  .map((log) => parseLog(contract, log))
  .find((event) => event?.name === 'CorporateTransferRecorded');
const operationId = transferEvent?.args.operationId ?? 1n;
const transfer = await contract.getCorporateTransfer(operationId);

const alertReceipt = await waitFor(
  contract.startAlert(reference, 3, 'Transferencia fuera de patrón para revisión de compliance'),
);
const alertEvent = alertReceipt.logs
  .map((log) => parseLog(contract, log))
  .find((event) => event?.name === 'AlertStarted');
const alertId = alertEvent?.args.alertId ?? 1n;
const alert = await contract.getAlert(alertId);

await waitFor(contract.pause());
if (!(await contract.paused())) {
  throw new Error('El circuito de pausa no quedó activo.');
}
await waitFor(contract.unpause());

console.log(
  JSON.stringify(
    {
      network: rpcUrl,
      contract: contractAddress,
      admin: adminAddress,
      beneficiary: beneficiaryAddress,
      transfer: {
        operationId: operationId.toString(),
        amount: transfer.amount.toString(),
        reference: transfer.operationReference,
        persisted: transfer.beneficiary.toLowerCase() === beneficiaryAddress.toLowerCase(),
      },
      alert: {
        alertId: alertId.toString(),
        riskLevel: Number(alert.riskLevel),
        reason: alert.reason,
        persisted: alert.operationReference === reference,
      },
      pauseCheck: 'passed',
    },
    null,
    2,
  ),
);

function parseLog(contractInstance, log) {
  try {
    return contractInstance.interface.parseLog(log);
  } catch {
    return null;
  }
}

async function waitFor(transactionPromise) {
  const transaction = await transactionPromise;
  return transaction.wait();
}
