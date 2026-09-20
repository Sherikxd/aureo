# Ejemplo de integración con HSKChain

Este ejemplo usa `@aureo/sdk` en modo lectura para comprobar que una dirección
`AureoCore` está desplegada en HSKChain. No firma ni envía transacciones.

## 1. Preparar la cuenta

Configura una cuenta de testnet en `blockchain/.env` solo para despliegue:

```dotenv
AUREO_LOCAL_DEFAULT_ACCOUNT=false
HASHKEY_NETWORK=testnet
HASHKEY_RPC_URL=https://testnet.hsk.xyz
HASHKEY_CHAIN_ID=133
DEPLOYER_PRIVATE_KEY=0x...
DEPLOYER_PUBLIC_ADDRESS=0x...
```

No compartas `DEPLOYER_PRIVATE_KEY` ni la guardes en Git.

## 2. Verificar la red

```bash
npm run hashkey:check
```

El comando confirma el `chainId` y el último bloque visible por RPC.

## 3. Desplegar `AureoCore`

```bash
npm run blockchain:compile
npm run deploy:hashkey
```

Obtén la dirección desde:

```text
blockchain/ignition/deployments/chain-133/deployed_addresses.json
```

Exporta la dirección, sin incluir una clave privada:

```bash
export AUREO_CORE_ADDRESS=0x...
export HASHKEY_RPC_URL=https://testnet.hsk.xyz
export HASHKEY_CHAIN_ID=133
node examples/hashkey-integration/src/read-only.mjs
```

La salida confirma el `chainId`, el RPC, la dirección y que existe bytecode.

## 4. Conectar el backend

En `backend/.env` configura:

```dotenv
BLOCKCHAIN_RPC_URL=https://testnet.hsk.xyz
AUREO_CORE_ADDRESS=0x...
BLOCKCHAIN_CONFIRMATIONS=2
BLOCKCHAIN_MAX_BLOCK_RANGE=2000
BACKEND_WINDOW_MS=60000
```

Inicia el backend:

```bash
npm run backend:start
```

Comprueba:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/metrics
```

El backend recuperará `CorporateTransferRecorded` por RPC y publicará los
veredictos por `ws://127.0.0.1:3000/stream`. Si el proveedor no ofrece
WebSocket, el backfill RPC seguirá funcionando; solo el stream del backend
requiere que la API local esté ejecutándose.

## Mainnet

Para mainnet cambia a `HASHKEY_NETWORK=mainnet`, `chainId=177` y
`https://mainnet.hsk.xyz`. Revisa el contrato, la cuenta y los límites de gas
antes de desplegar; este ejemplo no ejecuta operaciones en mainnet.
