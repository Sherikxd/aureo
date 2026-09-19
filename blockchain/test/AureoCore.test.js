import { anyValue } from '@nomicfoundation/hardhat-chai-matchers/withArgs.js';
import { expect } from 'chai';
import hre from 'hardhat';

const { ethers } = hre;

describe('AureoCore', function () {
  async function deploy() {
    const [admin, operator, compliance, beneficiary] = await ethers.getSigners();
    const AureoCore = await ethers.getContractFactory('AureoCore');
    const core = await AureoCore.deploy(admin.address);
    await core.waitForDeployment();
    return { core, admin, operator, compliance, beneficiary };
  }

  it('rejects a zero admin during deployment', async function () {
    const AureoCore = await ethers.getContractFactory('AureoCore');

    await expect(AureoCore.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      AureoCore,
      'InvalidAddress',
    );
  });

  it('persists a transfer and assigns a monotonic operation id', async function () {
    const { core, admin, beneficiary } = await deploy();
    const reference = ethers.encodeBytes32String('invoice-1');

    await expect(core.recordCorporateTransfer(beneficiary.address, 100n, reference))
      .to.emit(core, 'CorporateTransferRecorded')
      .withArgs(1n, admin.address, beneficiary.address, 100n, reference, anyValue);

    const transfer = await core.getCorporateTransfer(1n);
    expect(await core.operationCounter()).to.equal(1n);
    expect(transfer.initiator).to.equal(admin.address);
    expect(transfer.beneficiary).to.equal(beneficiary.address);
    expect(transfer.amount).to.equal(100n);
    expect(transfer.operationReference).to.equal(reference);
    expect(transfer.timestamp).to.be.greaterThan(0n);
  });

  it('uses an independent counter and persists compliance alerts', async function () {
    const { core, beneficiary } = await deploy();
    const reference = ethers.encodeBytes32String('invoice-2');

    await core.recordCorporateTransfer(beneficiary.address, 1n, reference);
    await expect(core.startAlert(reference, 3, 'Actividad inusual'))
      .to.emit(core, 'AlertStarted')
      .withArgs(1n, reference, 3, 'Actividad inusual', anyValue);

    const alert = await core.getAlert(1n);
    expect(alert.operationReference).to.equal(reference);
    expect(alert.riskLevel).to.equal(3);
    expect(alert.reason).to.equal('Actividad inusual');
    expect(await core.alertCounter()).to.equal(1n);
  });

  it('enforces separated roles', async function () {
    const { core, operator, compliance, beneficiary } = await deploy();
    const operatorRole = await core.OPERATOR_ROLE();
    const complianceRole = await core.COMPLIANCE_ROLE();

    await core.grantRole(operatorRole, operator.address);
    await core.grantRole(complianceRole, compliance.address);
    await expect(
      core.connect(operator).recordCorporateTransfer(beneficiary.address, 10n, ethers.ZeroHash),
    ).to.emit(core, 'CorporateTransferRecorded');
    await expect(core.connect(operator).startAlert(ethers.ZeroHash, 1, 'Revisión'))
      .to.be.revertedWithCustomError(core, 'AccessControlUnauthorizedAccount')
      .withArgs(operator.address, complianceRole);
    await expect(core.connect(compliance).startAlert(ethers.ZeroHash, 1, 'Revisión')).to.emit(
      core,
      'AlertStarted',
    );
  });

  it('rejects invalid input and blocks writes while paused', async function () {
    const { core, admin, beneficiary } = await deploy();

    await expect(
      core.recordCorporateTransfer(ethers.ZeroAddress, 1n, ethers.ZeroHash),
    ).to.be.revertedWithCustomError(core, 'InvalidAddress');
    await expect(
      core.recordCorporateTransfer(beneficiary.address, 0n, ethers.ZeroHash),
    ).to.be.revertedWithCustomError(core, 'InvalidAmount');
    await expect(core.startAlert(ethers.ZeroHash, 0, 'Riesgo')).to.be.revertedWithCustomError(
      core,
      'InvalidRiskLevel',
    );
    await expect(core.startAlert(ethers.ZeroHash, 5, 'Riesgo')).to.be.revertedWithCustomError(
      core,
      'InvalidRiskLevel',
    );
    await expect(core.startAlert(ethers.ZeroHash, 1, '')).to.be.revertedWithCustomError(
      core,
      'EmptyReason',
    );

    await core.connect(admin).pause();
    await expect(
      core.recordCorporateTransfer(beneficiary.address, 1n, ethers.ZeroHash),
    ).to.be.revertedWithCustomError(core, 'EnforcedPause');
    await core.connect(admin).unpause();
    await expect(core.recordCorporateTransfer(beneficiary.address, 1n, ethers.ZeroHash)).to.emit(
      core,
      'CorporateTransferRecorded',
    );
  });

  it('rejects unknown records', async function () {
    const { core } = await deploy();

    await expect(core.getCorporateTransfer(0n)).to.be.revertedWithCustomError(
      core,
      'UnknownOperation',
    );
    await expect(core.getAlert(1n)).to.be.revertedWithCustomError(core, 'UnknownAlert');
  });
});
