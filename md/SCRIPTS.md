# Scripts operativos

Todos se ejecutan desde la raíz del repositorio.

| Comando                              | Función                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| `npm run setup:env`                  | Crea los `.env` y ejecuta la configuración interactiva de wallet.                  |
| `npm run setup:env -- --skip-wallet` | Crea los `.env` sin solicitar una wallet.                                          |
| `npm run setup:env -- --force`       | Regenera las plantillas; reemplaza valores locales.                                |
| `npm run setup:wallet`               | Solicita y valida una wallet Ethereum; actualiza solo sus variables en los `.env`. |
| `npm run clean`                      | Limpia artefactos y secretos locales después de confirmación.                      |
| `npm run clean:force`                | Ejecuta la limpieza sin pregunta interactiva.                                      |
| `npm run deploy:blockchain`          | Compila y despliega `AureoCore` con Ignition.                                      |
| `npm run deploy:hashkey`             | Despliega `AureoCore` en la red HashKey configurada.                                |
| `npm run hashkey:check`              | Verifica RPC, chain ID y altura de bloque de HSKChain.                              |
| `npm run deploy:backend`             | Valida `backend/.env`, instala dependencias, ejecuta lint e inicia el backend.     |
| `npm run deploy:systemd`             | Instala el servicio `aureo-backend` en Linux con systemd.                          |
| `npm run demo:run`                   | Despliega el contrato y ejecuta la dapp de prueba del SDK.                         |
| `npm run demo:blockchain`            | Ejecuta el demo de persistencia, alertas y pausa del contrato.                     |
| `npm run demo:case -- normal`        | Ejecuta el caso local de transferencia corporativa normal.                         |
| `npm run demo:case -- speed`         | Ejecuta el caso local de operaciones rápidas y alerta de velocidad.                |
| `npm run demo:case -- volume`        | Ejecuta el caso local de volumen elevado, alerta y pausa explícita.                |
| `npm run metrics:realtime`          | Muestra métricas del backend y stream en tiempo real (opcional).                   |
| `npm run start:local`                | Inicia nodo Hardhat, despliega el contrato y arranca el backend sin Docker.        |
| `npm run start:local -- --with-cli`  | Inicia el entorno local anterior y la CLI en modo `stream`.                        |
| `npm run stop:local`                 | Detiene el nodo, backend y CLI del entorno local sin borrar despliegues.           |
| `npm run docker:up`                  | Construye y levanta nodo, despliegue y backend.                                    |
| `npm run docker:down`                | Detiene los servicios Docker.                                                      |
| `npm run docker:logs`                | Muestra logs del backend.                                                          |
| `npm run docker:cli`                 | Ejecuta la CLI dentro de Docker.                                                   |

### Cerrar el entorno local

Después de iniciar con `start:local`, cierra todos los procesos del stack con:

```bash
npm run stop:local
```

`start-local.sh` registra los PID en `.runtime/local-stack.pids`. El comando de
cierre detiene únicamente el nodo Hardhat, el backend y la CLI registrados; no
elimina los despliegues de Ignition ni el estado persistido en
`backend/.runtime`. Si el entorno fue iniciado antes de esta funcionalidad y
no existe el archivo de PID, el script intenta localizar solamente los
procesos locales conocidos.

También puedes pulsar `Ctrl+C` en la terminal donde corre `start:local`; el
script ejecuta la misma limpieza de procesos.

### Cuentas en el entorno local

Los comandos `deploy:blockchain`, `demo:run` y `start:local` usan por defecto
la primera cuenta prefunded que crea `hardhat node`. Esto permite ejecutar el
flujo local aunque `blockchain/.env` o `examples/demo-dapp/.env` contengan
claves de una wallet externa.

Los casos `demo:case` calculan sus métricas directamente con `@aureo/sdk` y no
requieren backend. `metrics:realtime` es un panel adicional para observar los
veredictos publicados por el backend; sus contadores son independientes de los
snapshots locales que imprime cada caso.

Para usar una wallet personalizada en el despliegue y en el demo:

```dotenv
# blockchain/.env
AUREO_LOCAL_DEFAULT_ACCOUNT=false
DEPLOYER_PRIVATE_KEY=0x...
DEPLOYER_PUBLIC_ADDRESS=0x...
```

Configura también `DEMO_PRIVATE_KEY` y `DEMO_PUBLIC_ADDRESS` en
`examples/demo-dapp/.env` si ejecutas `npm run demo:run`. La wallet debe tener
fondos en el nodo local; además, la cuenta del demo debe tener
`OPERATOR_ROLE` en `AureoCore`. No uses claves reales en este flujo.

## Configuración inicial

```bash
npm install
npm run setup:env
```

El script conserva `.env` existentes y siempre ejecuta la configuración
interactiva de wallet, salvo con `--skip-wallet`. Usa `--force` solo para volver
a copiar plantillas; no lo uses si quieres conservar sus valores.

Orden recomendado para un entorno nuevo:

```bash
npm install
npm run setup:env          # crea .env y configura la wallet
```

`setup:env` ejecuta `setup-wallet` automáticamente. Para un entorno que solo
necesita lectura o una ejecución no interactiva:

```bash
npm run setup:env -- --skip-wallet
```

La opción `--force` regenera las plantillas; después solicita y valida la
wallet, salvo que también se use `--skip-wallet`.

## Configurar la wallet

```bash
npm run setup:wallet
```

Solicita la clave privada sin eco, pide confirmación, solicita la dirección
pública y verifica que ambas correspondan usando `ethers`. Después actualiza:

```text
backend/.env                 ETH_PRIVATE_KEY / ETH_PUBLIC_ADDRESS
blockchain/.env              DEPLOYER_PRIVATE_KEY / DEPLOYER_PUBLIC_ADDRESS
examples/demo-dapp/.env      DEMO_PRIVATE_KEY / DEMO_PUBLIC_ADDRESS
```

Los archivos se dejan con permisos `600`. La clave nunca se imprime, pero el
script sí la escribe en esos `.env`; usa un gestor de secretos para entornos no
locales.

## Limpiar el proyecto

```bash
npm run clean
```

El comando elimina `node_modules`, `.env` locales, caches, artifacts, coverage,
dist, logs de gestores de paquetes, estados `.runtime` (incluido
`backend/.runtime`) y despliegues locales de Ignition. Conserva el código,
`package-lock.json` y todos los `.env.example`. Para automatización:

```bash
npm run clean:force
```

Después de limpiar:

```bash
npm install
npm run setup:env
```

Para omitir la wallet:

```bash
npm run setup:env -- --skip-wallet
```

## Flujo recomendado

### Demo del SDK

```bash
npm run setup:env
npm --workspace blockchain run node
```

En otra terminal:

```bash
npm run demo:run
```

### Demos de casos operativos

Con el nodo Hardhat activo, ejecuta uno de los casos documentados:

```bash
npm run demo:case -- normal
npm run demo:case -- speed
npm run demo:case -- volume
```

Los casos están almacenados en [`examples/cases/`](../examples/cases/) y cada
uno tiene documentación propia. Cada comando reutiliza el contrato local
desplegado cuando está disponible y devuelve un JSON con las transacciones,
bloques, métricas del SDK, referencias y acciones de compliance simuladas. Son
transacciones reales en la blockchain local, pero no representan pagos ni
operaciones en una red pública.

### HSKChain Testnet

Configura `HASHKEY_NETWORK=testnet`, `HASHKEY_RPC_URL`,
`HASHKEY_CHAIN_ID=133`, `DEPLOYER_PRIVATE_KEY` y
`AUREO_LOCAL_DEFAULT_ACCOUNT=false` en `blockchain/.env`. Despliega con:

```bash
npm run deploy:hashkey
```

Antes de desplegar puedes validar la red:

```bash
npm run hashkey:check
```

Configura `AUREO_CORE_ADDRESS`, `BLOCKCHAIN_RPC_URL` y
`BLOCKCHAIN_CONFIRMATIONS` en `backend/.env` antes de iniciar el backend.
Consulta [`HASHKEY.md`](HASHKEY.md) para Mainnet y los parámetros completos.

### Entorno Docker

Ejecuta la configuración y completa `backend/.env` con `GROQ_API_KEY` o
`XAI_API_KEY` si usarás análisis LLM:

```bash
npm run setup:env
npm run docker:up
```

### Entorno local sin Docker

Después de ejecutar `npm run setup:env` y completar `backend/.env`, inicia todos
los servicios base con:

```bash
npm run start:local
```

El script inicia el nodo Hardhat, despliega `AureoCore` automáticamente y usa
la cuenta local prefunded de Hardhat para el despliegue (sin modificar
`blockchain/.env`), y usa la dirección desplegada para arrancar el backend. Para
incluir la CLI en modo stream:

```bash
npm run start:local -- --with-cli
```

Pulsa `Ctrl+C` para detener el backend y el nodo local.

### Despliegue manual

```bash
npm run setup:env
npm --workspace blockchain run node
npm run deploy:blockchain
npm run deploy:backend
```

## Seguridad

`setup-env.sh` crea archivos con permisos `600`, pero no genera ni recupera
secretos. `setup-wallet.sh` escribe la clave introducida en los `.env` locales;
no la registra en pantalla. Para producción usa un gestor de secretos. Nunca
uses `--force` sobre un entorno que contenga valores que quieras conservar.
