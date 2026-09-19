# Demo local reproducible

Esta guía ejecuta el caso de uso principal de Áureo sin fondos reales:

1. un operador registra una transferencia corporativa;
2. el registro queda persistido y consultable en `AureoCore`;
3. compliance crea una alerta de riesgo asociada;
4. el circuito de pausa rechaza una nueva operación;
5. el script imprime las evidencias en JSON.

El demo usa las cuentas prefunded que Hardhat crea localmente. No conecta con
mainnet ni mueve ETH o tokens reales.

## Requisitos

- Node.js 20 o superior.
- Dependencias instaladas con `npm ci`.
- Puertos `8545` y, si se levanta el backend, `3000` disponibles.

## Demo blockchain

En una terminal inicia el nodo:

```bash
npm --workspace blockchain run node
```

En otra terminal despliega el contrato y conserva la dirección:

```bash
export HARDHAT_RPC_URL=http://127.0.0.1:8545
export AUREO_RUNTIME_ENV=/tmp/aureo-backend.env
npm run deploy:blockchain
export AUREO_CORE_ADDRESS="$(sed -n 's/^AUREO_CORE_ADDRESS=//p' /tmp/aureo-backend.env)"
```

Ejecuta el caso de uso:

```bash
npm run demo:blockchain
```

La salida contiene `operationId`, monto, referencia, `alertId`, nivel de riesgo
y `pauseCheck: "passed"`. El script falla si no puede persistir la transferencia,
persistir la alerta o confirmar que el contrato pausado rechaza nuevas escrituras.

## Demo completo con backend

Para observar el flujo de eventos y el análisis de ventanas:

```bash
npm run setup:env
```

Configura al menos `XAI_API_KEY` y `OPERATIONAL_RESERVE` en `backend/.env`.
Después:

```bash
npm run docker:up
```

En otra terminal verifica:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/wallet
npm run cli -- stream
```

El backend debe estar conectado a la dirección generada en
`/runtime/backend.env`. En modo local sin Docker, define
`AUREO_CORE_ADDRESS` y `BLOCKCHAIN_WS_URL=ws://127.0.0.1:8545` antes de iniciar
el backend.

## Pruebas automatizadas

```bash
npm run blockchain:compile
npm run blockchain:test
npm run lint
```

Estas pruebas no dependen de xAI ni de una red externa. Cubren roles, persistencia,
validaciones, pausa, eventos y consultas de identificadores inexistentes.

## Limpieza

Detén el nodo con `Ctrl+C`. Si usaste Compose:

```bash
npm run docker:down
```

No uses claves reales en archivos `.env` del demo ni en comandos compartidos.
