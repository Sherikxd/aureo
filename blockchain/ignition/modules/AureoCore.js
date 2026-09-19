import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

const AureoCoreModule = buildModule('AureoCoreModule', (module) => {
  const admin = module.getAccount(0);
  const aureoCore = module.contract('AureoCore', [admin]);

  return { aureoCore };
});

export default AureoCoreModule;
