# Áureo

Middleware open source para aplicaciones Ethereum: observabilidad, seguridad
de aplicaciones, evaluación de riesgo y tooling de wallets reutilizable.

Áureo proporciona componentes que otras aplicaciones Ethereum pueden integrar:
monitorización de eventos, signer/wallet tooling, evaluación de políticas,
alertas operativas y una API/CLI de desarrollo. La aplicación de referencia
escucha eventos corporativos, aplica reglas deterministas y puede consultar a
Grok para enriquecer el análisis.

## Por qué existe Áureo

Las aplicaciones que manejan operaciones corporativas sobre Ethereum necesitan
visibilidad y controles operativos sin perder las propiedades de auditabilidad
de la cadena. En la práctica, los eventos on-chain suelen quedar separados de
las reglas de riesgo, las alertas de compliance y las herramientas que usa el
equipo para investigar incidentes. Esta separación dificulta detectar patrones
anómalos a tiempo, responder ante una operación peligrosa y conservar evidencia
clara de lo ocurrido.

Áureo aborda ese problema como una capa middleware abierta y reutilizable:
registra operaciones y alertas en `AureoCore`, observa los eventos en tiempo
real, aplica reglas deterministas de velocidad y volumen, y expone los
resultados mediante API, WebSocket, CLI y SDK. El proyecto busca reducir el
tiempo entre una señal de riesgo y una respuesta verificable, sin custodiar
fondos ni sustituir los controles institucionales de firma, HSM, Safe o MPC.

## Application Middleware & Open-Source Tooling

El paquete reusable [`@aureo/sdk`](packages/sdk) es el centro de esta
adaptación. Permite a una dapp:

- Conectar un signer Ethereum sin exponer la clave privada al consumidor.
- Validar que la dirección pública corresponde a la clave privada.
- Suscribirse a eventos EVM por WebSocket con cleanup explícito.
- Ejecutar políticas de velocidad y volumen de forma determinista.
- Registrar transferencias mediante `createAureoClient` y obtener métricas
  locales de operaciones, montos, riesgo, MFA y bloqueos.
- Construir encima integraciones de smart accounts, session keys, gas
  abstraction, hardware wallets o proveedores MPC sin acoplarse al backend.

Áureo no custodia fondos ni pretende reemplazar un HSM, Safe o proveedor MPC.

## Arquitectura

```text
┌─────────────────────┐
│ AureoCore.sol       │
│ Hardhat + Ignition  │
└──────────┬──────────┘
           │ logs recuperados por RPC
           v
┌─────────────────────┐
│ Backend Node.js     │
│ ethers + reglas     │
│ Groq / xAI (opcional)│
└───────┬───────┬─────┘
        │       │
        │       └── WebSocket /stream
        │
        └────────── HTTP /health, /reports
                    │
                    v
             ┌──────────────┐
             │ CLI Aureo    │
             └──────────────┘
```

### Componentes

| Componente      | Responsabilidad                                                                 |
| --------------- | ------------------------------------------------------------------------------- |
| `blockchain/`   | Contrato `AureoCore`, roles de acceso, eventos empresariales y Circuit Breaker. |
| `backend/`      | Ingesta RPC, ventanas de análisis, reglas de riesgo y consulta a Groq/xAI.      |
| `packages/sdk/` | SDK reusable de wallet, monitoring, policies y métricas locales.                |
| `scripts/`      | Despliegue local, demos de casos, despliegue Docker y servicio systemd.           |
| `examples/`     | Dapp mínima y casos operativos reproducibles contra Hardhat.                     |
| `cli-client/`   | CLI para estado del backend, streams de riesgo y reportes de auditoría.          |
| `md/`           | Arquitectura, desarrollo local, manual de CLI y prompts para contribuir con IA. |
| `.copilot/`     | Reglas de contexto y hook de pre-commit.                                        |

## Requisitos

Para desarrollo manual:

- Node.js 20 o superior.
- npm 10 o superior.
- Docker Engine y Docker Compose v2, recomendado para el entorno completo.

Para crear la configuración local y configurar automáticamente la wallet:

```bash
npm run setup:env
```

El script conserva `.env` existentes, crea archivos con permisos `600` y ejecuta
`setup-wallet` en cada ejecución. Para generar solo plantillas sin solicitar una
wallet:

```bash
npm run setup:env -- --skip-wallet
```

Para análisis con un LLM puedes configurar `GROQ_API_KEY` o `XAI_API_KEY`.
Groq se selecciona automáticamente cuando ambas están presentes; usa
`LLM_PROVIDER=xai` para forzar xAI.

Para volver a configurar una wallet Ethereum de desarrollo sin regenerar
plantillas:

```bash
npm run setup:wallet
```

Para eliminar secretos y artefactos locales:

```bash
npm run clean
```

La referencia de estos scripts está en [`md/SCRIPTS.md`](md/SCRIPTS.md).
Los prompts reutilizables para investigar, implementar y revisar cambios con
asistencia de IA están en [`md/prompts/README.md`](md/prompts/README.md).
Los casos ejecutables y su explicación proceso por proceso están en
[`examples/cases/README.md`](examples/cases/README.md).
La integración de métricas en tiempo real está en
[`examples/realtime-metrics/README.md`](examples/realtime-metrics/README.md).
La integración configurable con HashKey Chain está en
[`md/HASHKEY.md`](md/HASHKEY.md).
Un ejemplo de integración read-only con HSKChain está en
[`examples/hashkey-integration/README.md`](examples/hashkey-integration/README.md).

Para firmar operaciones Ethereum desde el backend se necesita una wallet
operativa: `ETH_PRIVATE_KEY` y su dirección pública `ETH_PUBLIC_ADDRESS`. La
dirección pública se valida contra la clave privada al iniciar. Si no se
configura, el backend funciona únicamente en modo lectura.

### Redes compatibles

Además de Hardhat local, Áureo incluye configuración para HSKChain:

- Testnet: chain ID `133`, RPC `https://testnet.hsk.xyz`.
- Mainnet: chain ID `177`, RPC `https://mainnet.hsk.xyz`.

Consulta [`md/HASHKEY.md`](md/HASHKEY.md) para configurar la wallet, desplegar
`AureoCore` y ajustar confirmaciones y rangos RPC.

## Inicio rápido con Docker

### 1. Configurar secretos

```bash
npm run setup:env
```

Edita `backend/.env` y establece al menos:

```dotenv
XAI_API_KEY=tu-clave-de-xai
ETH_PRIVATE_KEY=0x...
ETH_PUBLIC_ADDRESS=0x...
OPERATIONAL_RESERVE=100000
```

`ETH_PRIVATE_KEY` es un secreto crítico. No guardes claves reales en Git ni en
archivos Docker versionados. En producción usa Vault, KMS, HSM, Safe o MPC.

### 2. Levantar el entorno

```bash
npm run docker:up
```

Compose inicia, en orden:

1. Nodo Hardhat en `127.0.0.1:8545`.
2. Despliegue de `AureoCore` mediante Hardhat Ignition.
3. Backend conectado a `ws://blockchain:8545`.
4. API y WebSocket del backend en el puerto `3000`.

### 3. Verificar el backend

```bash
curl http://127.0.0.1:3000/health
```

Para comprobar la wallet pública configurada:

```bash
curl http://127.0.0.1:3000/wallet
```

Respuesta esperada:

```json
{ "status": "ok" }
```

### 4. Usar la CLI

Desde el host:

```bash
npm run cli -- stream
npm run cli -- report "Resume los veredictos recientes"
npm run cli -- status
```

Dentro de Docker:

```bash
npm run docker:cli
```

### 5. Detener el entorno

```bash
npm run docker:down
```

Para eliminar también el estado del despliegue:

```bash
docker compose down -v
```

## Desarrollo sin Docker

La guía completa para instalar dependencias, ejecutar los ejemplos, levantar
el despliegue local, observar métricas y resolver problemas está en
[`md/GUIA_DESARROLLO_LOCAL.md`](md/GUIA_DESARROLLO_LOCAL.md).

```bash
npm install
npm run setup:env
```

En `backend/.env`, configura:

```dotenv
BLOCKCHAIN_WS_URL=ws://127.0.0.1:8545
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
AUREO_CORE_ADDRESS=0x...
LLM_PROVIDER=openrouter
LLM_FALLBACK_PROVIDERS=groq,xai
OPENROUTER_API_KEY=tu-clave-de-openrouter
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=openai/gpt-oss-20b
XAI_API_KEY=tu-clave-de-xai
XAI_BASE_URL=https://api.x.ai/v1
XAI_MODEL=grok-4.6
GROQ_API_KEY=tu-clave-de-groq
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=openai/gpt-oss-20b
LLM_TIMEOUT_MS=15000
LLM_MAX_RETRIES=2
LLM_RETRY_DELAY_MS=500
XAI_TIMEOUT_MS=15000
XAI_MAX_RETRIES=2
XAI_RETRY_DELAY_MS=500
ETH_PRIVATE_KEY=0x...
ETH_PUBLIC_ADDRESS=0x...
BACKEND_PORT=3000
OPERATIONAL_RESERVE=100000
```

El backend guarda su cursor de blockchain, eventos pendientes, históricos y
veredictos en `.runtime/backend-state.json` por defecto. Configura
`BACKEND_STATE_FILE` para usar otra ubicación persistente. La ingesta usa
`BLOCKCHAIN_RPC_URL` para recuperar logs desde el último bloque procesado tras
una desconexión o reinicio.

`LLM_PROVIDER=auto` prioriza OpenRouter, después Groq y finalmente xAI según
las claves disponibles. También puedes usar `LLM_PROVIDER=openrouter`,
`LLM_PROVIDER=groq`, `LLM_PROVIDER=xai` o `none`.
Las claves son opcionales para el arranque: sin un proveedor disponible, Áureo
usa las reglas deterministas y publica `fuente: "determinista_degradado"`.
Groq y xAI usan la misma interfaz compatible con OpenAI, con timeout,
reintentos limitados y backoff; el contexto enviado al LLM se minimiza a
iniciador, monto y bloque.

Después, en terminales separadas:

```bash
npm --workspace blockchain run node
npm run deploy:blockchain
npm run deploy:backend
npm run cli -- stream
```

Para iniciar el nodo, desplegar el contrato y arrancar el backend en una sola
terminal, sin Docker:

```bash
npm run start:local
```

Añade la CLI en modo `stream` con `npm run start:local -- --with-cli`.
Para cerrar ese entorno sin borrar los despliegues ni el estado del backend:

```bash
npm run stop:local
```

`start:local` registra los procesos en `.runtime/local-stack.pids`.
`stop:local` los detiene sin eliminar los despliegues de Ignition ni
`backend/.runtime`. Si el archivo de PID no existe, busca únicamente los
procesos locales conocidos. También puedes usar `Ctrl+C` en la terminal del
entorno.

El despliegue local requiere que el nodo Hardhat ya esté ejecutándose. Para
desplegar en `localhost`, el script usa por defecto la primera cuenta
prefunded de Hardhat. Si necesitas usar una wallet configurada en
`DEPLOYER_PRIVATE_KEY`, define `AUREO_LOCAL_DEFAULT_ACCOUNT=false`. Para
servidores Linux con systemd:

```bash
sudo npm run deploy:systemd
```

## Probar el SDK con una dapp mínima

El proyecto [`examples/demo-dapp`](examples/demo-dapp) despliega `AureoCore`,
envía cuatro operaciones locales y observa sus eventos usando `@aureo/sdk`:

```bash
npm run setup:env
npm --workspace blockchain run node
```

En otra terminal:

```bash
npm run demo:run
```

La salida confirma la wallet/signer utilizado, cada evento recibido por
WebSocket y la evaluación de la política. Con cuatro operaciones consecutivas
de la misma dirección se espera `speedRuleTriggered: true`. La guía completa
está en [`examples/demo-dapp/README.md`](examples/demo-dapp/README.md).

En el entorno local predeterminado, `npm run demo:run` usa la primera cuenta
prefunded de Hardhat tanto para el despliegue como para las operaciones. Para
usar una wallet de `examples/demo-dapp/.env`, define
`AUREO_LOCAL_DEFAULT_ACCOUNT=false` en `blockchain/.env`; esa wallet debe tener
fondos y el rol `OPERATOR_ROLE`.

La wallet del deployer (`DEPLOYER_PRIVATE_KEY`) y la wallet operativa del
backend (`ETH_PRIVATE_KEY`) pueden ser cuentas distintas. La wallet operativa
debe tener `OPERATOR_ROLE` o `COMPLIANCE_ROLE` en `AureoCore` antes de firmar
acciones administrativas. El backend todavía no ejecuta pausas automáticamente:
la wallet queda conectada y lista para integrar operaciones autorizadas.

## Reglas de riesgo

Las reglas deterministas se ejecutan antes de llamar a Grok:

- **Velocidad de bloque:** más de tres operaciones de la misma dirección dentro
  de un rango máximo de cinco bloques consecutivos produce riesgo `alto` y
  `bloquear_contrato: true`.
- **Anomalía de volumen:** un monto superior a tres veces el promedio histórico
  o a `OPERATIONAL_RESERVE` eleva el riesgo mínimo a `medio` y establece
  `requiere_mfa: true`.

La decisión de bloqueo se publica como veredicto auditable. La activación real
del Circuit Breaker debe quedar sometida a una política de autorización de
compliance; la CLI no valida MFA por sí sola.

## Usar el SDK en otra dapp

```bash
npm install @aureo/sdk ethers
```

```js
import { createAureoClient } from '@aureo/sdk';

const aureo = createAureoClient({
  rpcUrl: process.env.APP_RPC_URL,
  wsRpcUrl: process.env.APP_WS_RPC_URL,
  contractAddress: process.env.APP_CONTRACT_ADDRESS,
  abi: ['event Transfer(address indexed from,address indexed to,uint256 value)'],
});

const unsubscribe = aureo.subscribe('Transfer', (event) => {
  const result = aureo.evaluatePolicy([
    {
      initiator: event.args[0],
      amount: event.args[2].toString(),
      blockNumber: event.blockNumber,
    },
  ]);
  console.log(result);
});

// Para métricas independientes del backend:
// const result = await aureo.recordCorporateTransfer(beneficiary, 1000n, reference);
// console.log(aureo.metrics.snapshot());

// await aureo.close();
```

`aureo.metrics.snapshot()` mantiene contadores en memoria y no necesita que el
backend o su WebSocket estén activos. `aureo.recordCorporateTransfer(...)`
confirma la transacción, calcula la política local y devuelve la transferencia,
la política y el snapshot actualizado. Los montos se conservan como strings en
la salida para evitar pérdida de precisión.

Consulta la documentación del paquete en
[`packages/sdk/README.md`](packages/sdk/README.md).

## Interfaces del backend

### Healthcheck

```http
GET /health
```

### Reportes

```http
POST /reports
Content-Type: application/json

{"query":"¿Qué operaciones fueron de alto riesgo?"}
```

### Streaming

```text
WebSocket ws://127.0.0.1:3000/stream
```

Los mensajes de riesgo tienen esta forma:

```json
{
  "type": "risk_verdict",
  "verdict": {
    "nivel_riesgo": "alto",
    "motivo": "Regla de velocidad activada.",
    "bloquear_contrato": true,
    "requiere_mfa": false
  },
  "receivedAt": "2026-09-19T19:20:00.000Z"
}
```

## Comandos útiles

```bash
npm run lint
npm run format
npm run blockchain:compile
npm run blockchain:test
npm run docker:logs
```

## Documentación adicional

- [Arquitectura detallada](md/ARQUITECTURA.md)
- [Presentación del proyecto](md/PRESENTACION.md)
- [Desarrollo con Docker](md/DEVELOPMENT.md)
- [Guía de desarrollo local y ejemplos](md/GUIA_DESARROLLO_LOCAL.md)
- [Manual de la CLI](md/CLI.md)
- [Guía de la CLI junto al código](cli-client/README.md)
- [SDK open source](packages/sdk/README.md)
- [Demo dapp e integración](examples/demo-dapp/README.md)
- [Scripts operativos](md/SCRIPTS.md)

## Estado de producción

La base está preparada para desarrollo y pruebas locales. Antes de producción
deben añadirse una base compartida para múltiples instancias, autenticación del
WebSocket y API, métricas, gestión segura de secretos, reintentos con backoff,
política formal de MFA y pruebas de integración contra la red objetivo.
