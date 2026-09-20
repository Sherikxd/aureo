# Integración con HashKey Chain

Áureo puede desplegar `AureoCore` y ejecutar el backend sobre HSKChain
Testnet o Mainnet. La integración usa presets oficiales, pero permite
sobrescribir RPC y `chainId` cuando el proveedor lo requiera.

## Configuración

Completa `blockchain/.env`:

```dotenv
AUREO_LOCAL_DEFAULT_ACCOUNT=false
HASHKEY_NETWORK=testnet
HASHKEY_RPC_URL=https://testnet.hsk.xyz
HASHKEY_CHAIN_ID=133
HASHKEY_EXPLORER_URL=https://testnet-explorer.hskchain.net
DEPLOYER_PRIVATE_KEY=0x...
DEPLOYER_PUBLIC_ADDRESS=0x...
HASHKEY_WS_URL=wss://...
```

Valores oficiales incluidos:

| Red | `chainId` | RPC | Explorador |
| --- | ---: | --- | --- |
| HSKChain Testnet | `133` | `https://testnet.hsk.xyz` | `https://testnet-explorer.hskchain.net` |
| HSKChain Mainnet | `177` | `https://mainnet.hsk.xyz` | `https://hsk.blockscout.com` |

Referencia de red: [HSKChain](https://hskchain.net) y el registro público de
redes EVM de Chainlist. Comprueba la disponibilidad del RPC antes de desplegar,
porque los proveedores pueden aplicar límites o mantenimiento.

Para mainnet cambia `HASHKEY_NETWORK=mainnet`; el RPC, `chainId` y explorador
se seleccionan automáticamente. Los valores pueden sobreescribirse con las
variables explícitas.

No guardes la clave privada en Git. Usa un gestor de secretos, HSM, Safe o MPC
en entornos compartidos.

En `backend/.env`, usa el mismo contrato y RPC:

```dotenv
BLOCKCHAIN_RPC_URL=https://...
BLOCKCHAIN_WS_URL=wss://...
AUREO_CORE_ADDRESS=0x...
BLOCKCHAIN_CONFIRMATIONS=2
BLOCKCHAIN_MAX_BLOCK_RANGE=2000
```

`BLOCKCHAIN_CONFIRMATIONS` evita analizar bloques recientes que todavía podrían
reorganizarse. `BLOCKCHAIN_MAX_BLOCK_RANGE` limita cada consulta
`eth_getLogs`; reduce el valor si el proveedor RPC impone rangos más pequeños.

## Desplegar

Desde la raíz:

```bash
npm run blockchain:compile
npm run deploy:hashkey
```

El comando usa la red `hashkey` de Hardhat y requiere
`HASHKEY_NETWORK` (o `HASHKEY_RPC_URL` y `HASHKEY_CHAIN_ID`) y una cuenta de despliegue válida. La
dirección generada por Ignition queda en:

```text
blockchain/ignition/deployments/chain-<chainId>/deployed_addresses.json
```

Copia `AureoCoreModule#AureoCore` a `AUREO_CORE_ADDRESS` en `backend/.env`.

El ejemplo completo de verificación read-only está en
[`examples/hashkey-integration/README.md`](../examples/hashkey-integration/README.md).

## Arrancar el backend

```bash
npm run backend:start
```

Comprueba la conectividad:

```bash
curl http://127.0.0.1:3000/health
```

El backend recupera `CorporateTransferRecorded` por RPC, mantiene el cursor
persistido, elimina duplicados y publica veredictos por `/stream`. El SDK puede
conectarse directamente a la misma red con `HASHKEY_RPC_URL` y
`HASHKEY_WS_URL`.

## Seguridad y operación

- Verifica el contrato desplegado en el explorador de HashKey.
- Usa una wallet dedicada o multisig para roles de despliegue y compliance.
- No uses `AUREO_LOCAL_DEFAULT_ACCOUNT=true` fuera de Hardhat local.
- Configura confirmaciones de acuerdo con la finality de la red.
- Para varias instancias, sustituye el estado JSON por una base compartida.
- Prueba primero en la testnet correspondiente antes de mainnet.
