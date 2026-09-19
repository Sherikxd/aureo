# @aureo/sdk

Middleware open source para aplicaciones Ethereum:

- `createEthereumSigner`: wallet/signer con validación de dirección pública.
- `createEthereumMonitor`: suscripción WebSocket a eventos de cualquier contrato.
- `evaluateEthereumPolicy`: políticas deterministas de velocidad y volumen.

```js
import { createEthereumMonitor, evaluateEthereumPolicy } from '@aureo/sdk';

const monitor = createEthereumMonitor({
  rpcUrl: 'wss://ethereum.example',
  contractAddress: '0x...',
  abi: ['event Transfer(address indexed from,address indexed to,uint256 value)'],
});

const unsubscribe = monitor.subscribe('Transfer', (event) => {
  const policy = evaluateEthereumPolicy([
    { initiator: event.args[0], amount: event.args[2].toString(), blockNumber: event.blockNumber },
  ]);
  console.log(policy);
});

// unsubscribe();
// await monitor.close();
```

El SDK no envía fondos ni guarda claves. La clave privada debe provenir de un
secret manager, HSM, Safe o proveedor MPC en producción.
