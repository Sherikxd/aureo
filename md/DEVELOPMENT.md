# Demo local reproducible

Para una guía única de instalación, ejemplos, despliegue local, métricas y
solución de problemas, consulta
[`GUIA_DESARROLLO_LOCAL.md`](GUIA_DESARROLLO_LOCAL.md).

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

En `localhost`, `deploy:blockchain` usa la primera cuenta prefunded de Hardhat
por defecto e ignora `DEPLOYER_PRIVATE_KEY`. Para desplegar con una wallet
personalizada, configura `AUREO_LOCAL_DEFAULT_ACCOUNT=false` en
`blockchain/.env`; la cuenta debe tener fondos en el nodo local.

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

`setup:env` solicita y valida una wallet Ethereum en cada ejecución. Si el
entorno solo necesita lectura, usa `npm run setup:env -- --skip-wallet`.

Configura `OPENROUTER_API_KEY` si quieres análisis LLM y
`OPERATIONAL_RESERVE` en `backend/.env`. OpenRouter usa por defecto
`openai/gpt-oss-20b`; Groq y xAI permanecen disponibles como alternativas.
Sin claves, el backend usa el modo determinista degradado.
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

Para iniciar el stack local completo sin Docker:

```bash
npm run start:local -- --with-cli
```

Para cerrarlo sin borrar despliegues ni el estado persistido:

```bash
npm run stop:local
```

El cierre detiene el nodo Hardhat, el backend y la CLI. También puedes usar
`Ctrl+C` en la terminal de `start:local`.

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

## HSKChain Testnet

Para probar el despliegue en HSKChain Testnet, configura
`HASHKEY_NETWORK=testnet`, `DEPLOYER_PRIVATE_KEY` y
`AUREO_LOCAL_DEFAULT_ACCOUNT=false` en `blockchain/.env`. Usa una cuenta con
fondos de testnet y ejecuta:

```bash
npm run deploy:hashkey
```

Después define en `backend/.env` la dirección desplegada, el RPC de testnet y
un número de confirmaciones, por ejemplo `BLOCKCHAIN_CONFIRMATIONS=2`.
Valida primero la conexión con `npm run hashkey:check`. Los detalles, el flujo
completo y el ejemplo read-only están en
[`HASHKEY.md`](HASHKEY.md) y
[`examples/hashkey-integration/README.md`](../examples/hashkey-integration/README.md).

Los casos `npm run demo:case -- normal|speed|volume` son exclusivamente
locales: no envían transacciones a HSKChain. Para integrar una aplicación
real, usa el SDK con el RPC y la dirección del contrato de HSKChain del
ejemplo dedicado.
