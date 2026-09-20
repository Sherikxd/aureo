import { ethers } from 'ethers';
import { createAureoClient } from '@aureo/sdk';

const rpcUrl = process.env.HARDHAT_RPC_URL ?? 'http://127.0.0.1:8545';
const contractAddress = process.env.AUREO_CORE_ADDRESS;
const selectedCase = process.env.AUREO_DEMO_CASE ?? 'normal';

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
const aureo = createAureoClient({
  rpcUrl,
  contractAddress,
  abi,
  signer: admin,
});
const contract = aureo.contract;

await ensureRoles(contract, adminAddress);
if (await contract.paused()) await waitFor(contract.unpause());

const runners = { normal: runNormal, speed: runSpeed, volume: runVolume };
if (!runners[selectedCase]) {
  throw new Error(`Caso inválido: ${selectedCase}. Usa normal, speed o volume.`);
}

const result = await runners[selectedCase]();
console.log(JSON.stringify({
  case: selectedCase,
  network: rpcUrl,
  contract: contractAddress,
  metrics: aureo.metrics.snapshot(),
  ...result,
}, null, 2));
await aureo.close();
await provider.destroy();

async function runNormal() {
  const transfer = await record('PAYROLL-DEMO', 25_000n);
  return {
    scenario: 'Transferencia corporativa dentro de la reserva operativa.',
    expectedRisk: 'bajo',
    transfer,
    complianceAction: 'No se crea alerta ni se pausa el contrato.',
  };
}

async function runSpeed() {
  const transfers = [];
  for (const suffix of ['A', 'B', 'C', 'D']) {
    transfers.push(await record(`BATCH-DEMO-${suffix}`, 1_000n));
  }
  const firstBlock = transfers[0].blockNumber;
  const lastBlock = transfers.at(-1).blockNumber;
  if (lastBlock - firstBlock > 4) {
    throw new Error('El nodo no produjo la ventana esperada de cinco bloques.');
  }
  return {
    scenario: 'Cuatro transferencias de la misma cuenta en cinco bloques.',
    expectedRisk: 'alto',
    speedViolation: true,
    transfers,
    complianceAction: 'La pausa queda como decisión explícita de compliance.',
  };
}

async function runVolume() {
  await record('HISTORY-DEMO-1', 10_000n);
  await record('HISTORY-DEMO-2', 12_000n);
  const transfer = await record('ACQ-DEMO-URGENT', 350_000n);
  const alert = await startAlert(
    transfer.reference,
    2,
    'Monto superior a la reserva operativa; requiere MFA y revisión de compliance.',
  );
  await waitFor(contract.pause());
  const paused = await contract.paused();
  if (!paused) throw new Error('El circuito de pausa no quedó activo.');
  await waitFor(contract.unpause());
  return {
    scenario: 'Transferencia superior a la reserva con alerta y pausa aprobada.',
    expectedRisk: 'medio',
    volumeViolation: true,
    history: [10_000, 12_000],
    transfer,
    alert,
    pauseCheck: 'passed',
    complianceAction: 'Se registró una alerta y se pausó el contrato de forma explícita.',
  };
}

async function record(label, amount) {
  const reference = ethers.encodeBytes32String(label);
  const result = await aureo.recordCorporateTransfer(beneficiaryAddress, amount, reference);
  return {
    ...result.transfer,
    reference,
    policy: result.policy,
  };
}

async function startAlert(reference, riskLevel, reason) {
  const receipt = await waitFor(contract.startAlert(reference, riskLevel, reason));
  const event = findEvent(receipt, 'AlertStarted');
  return {
    alertId: (event?.args.alertId ?? 0n).toString(),
    riskLevel,
    reference,
    reason,
    blockNumber: receipt.blockNumber,
  };
}

async function ensureRoles(instance, account) {
  const operatorRole = await instance.OPERATOR_ROLE();
  const complianceRole = await instance.COMPLIANCE_ROLE();
  await waitFor(instance.grantRole(operatorRole, account));
  await waitFor(instance.grantRole(complianceRole, account));
}

function findEvent(receipt, name) {
  for (const log of receipt.logs) {
    try {
      const event = contract.interface.parseLog(log);
      if (event?.name === name) return event;
    } catch {
      // Ignore logs emitted by unrelated contracts.
    }
  }
  return null;
}

async function waitFor(transactionPromise) {
  const transaction = await transactionPromise;
  return transaction.wait();
}
