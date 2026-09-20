# @aureo/sdk

Middleware open source para aplicaciones Ethereum:

- `createEthereumSigner`: wallet/signer con validación de dirección pública.
- `createEthereumMonitor`: suscripción WebSocket a eventos de cualquier contrato.
- `evaluateEthereumPolicy`: políticas deterministas de velocidad y volumen.
- `createAureoClient`: fachada para configurar provider, signer, contrato, monitor
  y políticas en una sola integración.

## Integración rápida

Configura el cliente una sola vez. El signer es opcional: sin clave privada el
cliente funciona en modo lectura.

```js
import { createAureoClient } from '@aureo/sdk';

const abi = [
  'function recordCorporateTransfer(address,uint256,bytes32) returns (uint256)',
  'event CorporateTransferRecorded(uint256 indexed operationId,address indexed initiator,address indexed beneficiary,uint256 amount,bytes32 operationReference,uint256 timestamp)',
];

const aureo = createAureoClient({
  rpcUrl: process.env.ETH_RPC_URL,
  wsRpcUrl: process.env.ETH_WS_RPC_URL,
  contractAddress: process.env.AUREO_CORE_ADDRESS,
  abi,
  privateKey: process.env.ETH_PRIVATE_KEY,
  publicAddress: process.env.ETH_PUBLIC_ADDRESS,
});

const unsubscribe = aureo.subscribe('CorporateTransferRecorded', (event) => {
  const policy = aureo.evaluatePolicy([
    {
      initiator: event.args[1],
      amount: event.args[3].toString(),
      blockNumber: event.blockNumber,
    },
  ]);
  console.log(policy);
});

// await aureo.contract.recordCorporateTransfer(...); // requiere signer
// unsubscribe();
// await aureo.close();
```

### Modos de uso

- **Solo lectura:** proporciona `rpcUrl`, `contractAddress` y `abi`.
- **Firmas:** añade `privateKey`; `publicAddress` valida que la clave sea la
  esperada.
- **Eventos:** añade `wsRpcUrl` y usa `getMonitor()`.
- **Políticas:** usa `aureo.evaluatePolicy(...)` sin configurar blockchain.

El cliente no expone la clave privada en sus propiedades ni en los eventos. En
producción, carga las claves desde un secret manager, HSM, Safe o proveedor
MPC; no las incluyas directamente en el código.

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
