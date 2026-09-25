# @aureo/sdk

Middleware open source para aplicaciones Ethereum: wallet/signer, monitor de eventos, políticas deterministas y métricas locales.

## Capabilidades

El SDK proporciona:

| Función | Descripción |
|---------|-------------|
| `createEthereumSigner` | Wallet/signer con validación de dirección pública; la clave privada nunca se expone a callers |
| `createEthereumMonitor` | Suscripción WebSocket a eventos de cualquier contrato EVM |
| `evaluateEthereumPolicy` | Políticas deterministas de velocidad y volumen (sin necesidad de LLM) |
| `createMetrics` | Métricas locales de operaciones, riesgo, MFA y bloqueos |
| `createAureoClient` | Fachada completa que integra provider, signer, contrato, monitor y métricas |

## Integración rápida

Configura el cliente una sola vez. El signer es opcional: sin clave privada el cliente funciona en modo lectura.

```js
import { createAureoClient } from '@aureo/sdk';

const abi = [
  'function recordCorporateTransfer(address,uint256,bytes32) returns (uint256)',
  'event CorporateTransferRecorded(uint256 indexed operationId,address indexed initiator,address indexed beneficiary,uint256 amount,bytes32 operationReference,uint256 timestamp)',
];

const aureo = createAureoClient({
  rpcUrl: process.env.APP_RPC_URL,
  wsRpcUrl: process.env.APP_WS_RPC_URL,
  contractAddress: process.env.AUREO_CORE_ADDRESS,
  abi,
  privateKey: process.env.ETH_PRIVATE_KEY,
  publicAddress: process.env.ETH_PUBLIC_ADDRESS,
});

const result = await aureo.recordCorporateTransfer(
  '0x0000000000000000000000000000000000000001',
  1000n,
  '0x'.padEnd(66, '0'),
);
console.log(result.policy, result.metrics);

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
```

## Modos de uso

### Solo lectura
Proporciona `rpcUrl`, `contractAddress` y `abi`. El cliente puede suscribirse a eventos y evaluar políticas sin firmar transacciones.

### Firmas
Añade `privateKey`; `publicAddress` valida que la clave sea la esperada. El signer se usa para:

- Registrar transferencias (`recordCorporateTransfer`)
- Firmar transacciones on-chain
- Acciones administrativas en `AureoCore`

### Eventos
Añade `wsRpcUrl` y usa `getMonitor()` para suscribirse a eventos en tiempo real mediante WebSocket.

### Políticas
Usa `aureo.evaluatePolicy(...)` sin configurar blockchain. Las políticas son determinísticas y se ejecutan antes de cualquier llamada a LLM.

### Métricas
Usa `aureo.metrics.snapshot()` o registra transferencias mediante `aureo.recordCorporateTransfer(...)`. Los contadores se calculan localmente y no dependen del backend, WebSocket ni xAI.

```js
// Snapshot de métricas locales
console.log(aureo.metrics.snapshot());
// {
//   transfers: 3,
//   totalAmount: '372000',
//   byRisk: { bajo: 2, medio: 1 },
//   mfaRequired: 1,
//   contractBlocks: 0,
//   lastPolicy: { ... },
//   lastVerdict: null
// }
```

## API detallada

### `createAureoClient(options)`

Crea un cliente Áureo configurado para integraciones EVM comunes.

**Opciones:**

| Opción | Tipo | Descripción |
|--------|------|-------------|
| `rpcUrl` | `string` | RPC URL del nodo (obligatorio) |
| `wsRpcUrl` | `string` | URL WebSocket para monitor de eventos |
| `contractAddress` | `string` | Dirección del contrato AureoCore |
| `abi` | `ethers.InterfaceAbi` | ABI del contrato (mínimo incluye `recordCorporateTransfer` y `CorporateTransferRecorded`) |
| `privateKey` | `string` | Clave privada para firmar transacciones (opcional) |
| `publicAddress` | `string` | Dirección pública esperada (validada contra `privateKey`) |
| `signer` | `ethers.Signer` | Signer de ethers.js inyectado (alternativa a `privateKey`) |
| `speedThreshold` | `number` | Umbral para regla de velocidad (default: 3) |
| `speedBlockWindow` | `number` | Ventana de bloques para regla de velocidad (default: 4 = 5 bloques inclusive) |
| `volumeMultiplier` | `number` | Multiplicador para regla de volumen (default: 3 = 3x histórico) |
| `emaAlpha` | `number` | Factor EMA para cálculo de tendencias (default: 0.3) |

**Retorna:**

```js
{
  provider: ethers.JsonRpcProvider,
  signer: ethers.Wallet | null,
  address: string | null,
  contract: ethers.Contract | null,
  metrics: object with methods below,
  evaluatePolicy: function,
  recordCorporateTransfer: async function,
  getMonitor: function,
  subscribe: function,
  close: async function,
}
```

### `aureo.recordCorporateTransfer(beneficiary, amount, operationReference)`

Registra una transferencia corporativa en el contrato y calcula la política local.

```js
const result = await aureo.recordCorporateTransfer(
  '0xbeneficiary_address',
  1000n, // bigint o string para precisión
  'ref-001' // referencia opaca de 32 bytes
);
// Retorna: { transfer, policy, metrics: metrics.snapshot() }
// - transfer: objeto con operationId, initiator, beneficiary, amount, operationReference, blockNumber, transactionHash
// - policy: resultado de evaluateEthereumPolicy
// - metrics: snapshot actualizado de métricas locales
```

### `aureo.evaluatePolicy(transfers, context?)`

Evalúa políticas deterministas sobre un arreglo de transfers.

```js
const result = aureo.evaluatePolicy([
  {
    initiator: '0xwallet_address',
    amount: '1000', // string, number o bigint
    blockNumber: 12345,
  },
]);

// Retorna:
// {
//   speedViolation: boolean,
//   volumeViolation: boolean,
//   minimumRisk: 'bajo' | 'medio', // 'medio' si hay volumeViolation, 'bajo' en otro caso
//   reasons: string[] // razones activadas
// }
```

**Contexto opcional:**

```js
{
  historicalAmounts: Map<address, amount[]> | Record<address, amount[]>, // historial por iniciador
  operationalReserve: string|number|bigint, // reserva operativa para comparación
  speedThreshold: number, // override default 3
  speedBlockWindow: number, // override default 4 (5 bloques)
  volumeMultiplier: number, // override default 3
}
```

### `aureo.getMonitor()`

Retorna el monitor Ethereum si ya fue creado, o lanza error si falta `wsRpcUrl`.

```js
const monitor = aureo.getMonitor();
// monitor.subscribe(eventName, handler) - mismo que aureo.subscribe
```

### `aureo.subscribe(eventName, handler)`

Suscribe un handler a eventos del contrato.

```js
const unsubscribe = aureo.subscribe('CorporateTransferRecorded', (event) => {
  console.log('Evento recibido:', event);
  // event = { eventName, args, blockNumber, transactionHash }
});

// Retorna función unsubscribe(): () => { ... }
```

### `aureo.close()`

Cierra todas las conexiones (monitor WebSocket y proveedor RPC).

```js
await aureo.close();
// Libera recursos y removeAllListeners
```

### `aureo.metrics.snapshot()`

Retorna el snapshot actual de métricas locales.

```js
const snapshot = aureo.metrics.snapshot();
// {
//   transfers: number,
//   totalAmount: string, // siempre string para precisión
//   byRisk: { 'alto': number, 'medio': number, 'bajo': number },
//   mfaRequired: number,
//   contractBlocks: number,
//   lastPolicy: PolicyResult | null,
//   lastVerdict: {nivel_riesgo, requiere_mfa, bloquear_contrato} | null,
// }
// - totalAmount siempre es string para evitar pérdida de precisión al serializar JSON
// - byRisk cuenta transfers por nivel de riesgo
// - mfaRequired cuenta transfers con volumeViolation
// - contractBlocks cuenta transfers con speedViolation
```

### `aureo.metrics.getEMA(address)`

Retorna el valor EMA (Media Móvil Exponencial) para un iniciador.

```js
const ema = aureo.metrics.getEMA('0xwallet_address');
// number | null si no hay datos
```

### `aureo.metrics.getEMAHistory()`

Retorna el historial EMA de todos los iniciadores.

```js
const history = aureo.metrics.getEMAHistory();
// { '0xaddress': number, ... }
```

### `aureo.metrics.reset()`

Reinicia todas las métricas y historial local.

```js
aureo.metrics.reset();
// Todos los contadores vuelven a 0, historial y EMA limpiados
```

### `aureo.metrics.recordVerdict(verdict)`

Añade un veredicto externo al conteo de métricas (útil cuando la aplicación también consume el backend).

```js
aureo.metrics.recordVerdict({
  nivel_riesgo: 'alto',
  requiere_mfa: true,
  bloquear_contrato: false,
});
// Actualiza snapshot.byRisk, snapshot.mfaRequired, snapshot.contractBlocks, snapshot.lastVerdict
```

## Ejemplos avanzados

### 1. Modo solo lectura (sin clave privada)

```js
import { createAureoClient } from '@aureo/sdk';

const aureo = createAureoClient({
  rpcUrl: 'https://rpc.example.com',
  contractAddress: '0xAureoCoreAddress',
  abi: ['event CorporateTransferRecorded(...)'],
});

// Suscribirse a eventos sin firmar
const unsubscribe = aureo.subscribe('CorporateTransferRecorded', (event) => {
  const policy = aureo.evaluatePolicy([
    {
      initiator: event.args[1],
      amount: event.args[3].toString(),
      blockNumber: event.blockNumber,
    },
  ]);
  console.log('Política evaluada:', policy);
});

// No necesitas cerrar si solo quieres escuchar eventos
// Pero recuerda que el monitor mantiene la conexión WebSocket abierta
```

### 2. Evaluación de política sin blockchain

```js
import { evaluateEthereumPolicy } from '@aureo/sdk';

// Sin necesidad de rpcUrl, contrato o red
const result = evaluateEthereumPolicy([
  {
    initiator: '0xwallet1',
    amount: '500',
    blockNumber: 100,
  },
  {
    initiator: '0xwallet1', 
    amount: '600',
    blockNumber: 101,
  },
  {
    initiator: '0xwallet1',
    amount: '700',
    blockNumber: 102,
  },
]);

console.log(result);
// {
//   speedViolation: true, // 3+ operaciones mismas wallet en pocos bloques
//   volumeViolation: false,
//   minimumRisk: 'bajo',
//   reasons: ['Más de 3 operaciones de una dirección en 5 bloques consecutivos.']
// }
```

### 3. Monitor WebSocket para eventos en tiempo real

```js
import { createEthereumMonitor, evaluateEthereumPolicy } from '@aureo/sdk';

const monitor = createEthereumMonitor({
  rpcUrl: 'wss://rpc.example.com',
  contractAddress: '0xAureoCoreAddress',
  abi: ['event CorporateTransferRecorded(...)'],
});

const unsubscribe = monitor.subscribe('CorporateTransferRecorded', (event) => {
  const policy = evaluateEthereumPolicy([
    {
      initiator: event.args[1],
      amount: event.args[3].toString(),
      blockNumber: event.blockNumber,
    },
  ]);
  console.log('Señal de riesgo:', policy);
  console.log('Riesgo:', policy.speedViolation ? 'ALTO' : policy.volumeViolation ? 'MEDIO' : 'BAJO');
});

// Cuando ya no necesites el monitor:
await monitor.close();
// o const unsubscribe = monitor.subscribe(...) y luego unsubscribe()
```

### 4. Crear signer sin exponer la clave privada

```js
import { createEthereumSigner } from '@aureo/sdk';
import { ethers } from 'ethers';

// El provider puede ser cualquier provider de ethers
const provider = new ethers.JsonRpcProvider('https://rpc.example.com');

// Opcional: validar dirección pública
const signerInfo = createEthereumSigner(provider, {
  privateKey: process.env.ETH_PRIVATE_KEY,
  publicAddress: process.env.ETH_PUBLIC_ADDRESS,
});

// signerInfo.signer es ethers.Wallet
// signerInfo.address es la dirección validada

if (signerInfo) {
  console.log('Signer creado para:', signerInfo.address);
} else {
  console.log('Modo solo lectura - no hay clave privada');
}
```

### 5. Crear métricas independientes

```js
import { createMetrics } from '@aureo/sdk';

const metrics = createMetrics({
  emaAlpha: 0.2, // factor EMA personalizado
});

// Registrar transfers manualmente
const policy1 = metrics.recordTransfer({
  initiator: '0xaddr1',
  amount: '100',
  blockNumber: 1000,
});

const policy2 = metrics.recordTransfer({
  initiator: '0xaddr1',
  amount: '200',
  blockNumber: 1001,
});

const snapshot = metrics.snapshot();
console.log(snapshot);
// {
//   transfers: 2,
//   totalAmount: '300',
//   byRisk: { bajo: 2 },
//   mfaRequired: 0,
//   contractBlocks: 0,
//   lastPolicy: policy1, // o policy2 dependiendo del orden
//   lastVerdict: null
// }
```

## Integración con el backend Áureo

El SDK puede operar de forma independiente del backend, pero también se integra:

1. **Sin backend**: `recordCorporateTransfer` requiere contrato y signer, pero `evaluatePolicy` y `metrics` funcionan localmente.

2. **Con backend**: El SDK puede suscribirse al WebSocket del backend para recibir veredictos en tiempo real, manteniendo métricas locales sincronizadas.

3. **Modo degradado**: Si no hay LLM disponible (sin claves API), el SDK sigue funcionando con reglas deterministas y publica `fuente: "determinista_degradado"` en los resultados.

## Seguridad

- **Nunca embedes `ETH_PRIVATE_KEY` en el código frontend o repositorios públicos**
- En producción, carga las claves desde un secret manager, HSM, Safe o proveedor MPC
- El SDK nunca expone la clave privada en sus propiedades o eventos
- `publicAddress` se valida automáticamente contra la clave privada al crear el signer
- Si solo tienes `ETH_PUBLIC_ADDRESS` sin `ETH_PRIVATE_KEY`, el cliente funciona en modo solo lectura

## Límites actuales

- Las métricas y EMA viven en memoria y se reinician al crear un nuevo cliente
- No persiste historial entre reinicios de proceso
- La regla de velocidad requiere bloques consecutivos; gaps en los bloques reinician el conteo
- La regla de volumen compara contra historial proporcionado o `operationalReserve` del contexto
- El contrato `AureoCore` debe estar desplegado y los eventos deben ser emitidos correctamente
- `bloquear_contrato` es una recomendación del analizador, no una orden automática de congelamiento

## Desarrollo y pruebas

```bash
# Desde la raíz del monorepo
npm --workspace @aureo/sdk run lint
npm --workspace @aureo/sdk run pack
```

La documentación completa del proyecto está en el directorio `md/` y el README principal en `../README.md`.