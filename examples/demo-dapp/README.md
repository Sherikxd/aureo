# Demo dapp de Áureo

Proyecto mínimo para probar `@aureo/sdk` contra el contrato `AureoCore` en una
red Hardhat local. La demo ejercita las tres piezas del SDK:

1. `createEthereumSigner` para conectar una wallet Ethereum opcional.
2. `createEthereumMonitor` para escuchar `CorporateTransferRecorded` por WebSocket.
3. `evaluateEthereumPolicy` para detectar la regla de más de tres operaciones
   dentro de cinco bloques.

La demo no usa una red pública ni mueve fondos reales.

## Inicio rápido

Desde la raíz del monorepo:

```bash
npm install
npm run setup:env
npm --workspace blockchain run node
```

El comando anterior configura también la wallet. Para usar las cuentas
prefinanciadas de Hardhat sin solicitar una clave, ejecuta:

```bash
npm run setup:env -- --skip-wallet
```

En otra terminal:

```bash
npm run demo:run
```

El script despliega `AureoCore` automáticamente, inyecta
`AUREO_CORE_ADDRESS` en la ejecución y envía cuatro operaciones. El resultado
debe mostrar `speedViolation: true`.

## Probar una wallet Ethereum

Por defecto la demo usa la cuenta `0` que expone Hardhat mediante
`JsonRpcProvider`. Para probar el módulo de wallet del SDK, configura en
`examples/demo-dapp/.env` la clave privada de la cuenta administradora que
imprime `hardhat node`:

```dotenv
DEMO_PRIVATE_KEY=0x...
DEMO_PUBLIC_ADDRESS=0x...
```

La cuenta debe ser la administradora del contrato desplegado. Puedes llenar
estos valores automáticamente con:

```bash
npm run setup:wallet
```

La clave es solo para desarrollo local y nunca debe reutilizarse en una red
pública.

También puedes cambiar el beneficiario, el número de operaciones y el monto:

```dotenv
DEMO_BENEFICIARY=0x...
DEMO_OPERATIONS=4
DEMO_AMOUNT=10
```

## Flujo de la demo

```text
Hardhat node
    |
    +--> deploy:blockchain -> AureoCore
    |
    +--> demo dapp
           |
           +--> wallet/signer con ethers
           +--> recordCorporateTransfer(...)
           +--> WebSocket monitor
           +--> policy evaluator
```

Cada evento recibido se normaliza, se añade al lote local y se pasa a
`evaluateEthereumPolicy`. Con cuatro operaciones consecutivas de la misma
dirección, la salida muestra:

```json
{
  "speedViolation": true,
  "minimumRisk": "bajo",
  "reasons": ["Más de 3 operaciones de una dirección en 5 bloques consecutivos."]
}
```

`minimumRisk` representa el umbral mínimo de la política; el backend de
referencia convierte esta violación en riesgo `alto` y bloqueo.

## Integración en otra aplicación

Instala el paquete:

```bash
npm install @aureo/sdk ethers
```

Importa solo lo que necesites:

```js
import { createEthereumMonitor, evaluateEthereumPolicy } from '@aureo/sdk';
```

El SDK es independiente del backend, la CLI y el contrato de ejemplo.
