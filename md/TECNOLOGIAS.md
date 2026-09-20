# Tecnologías de Áureo

Referencia de las tecnologías que forman el sistema y de la responsabilidad
de cada una dentro del flujo de observabilidad y compliance Web3.

## Vista general

| Capa                  | Tecnología              | Responsabilidad                                       |
| --------------------- | ----------------------- | ----------------------------------------------------- |
| Runtime               | Node.js 20+             | Ejecutar los workspaces ESM                           |
| Gestión de paquetes   | npm workspaces          | Instalar dependencias y compartir el lockfile         |
| Contratos             | Solidity + OpenZeppelin | Registrar operaciones y alertas auditables            |
| Blockchain local      | Hardhat Network         | Nodo RPC local y entorno de pruebas                   |
| Red EVM externa       | HSKChain Testnet/Mainnet | Despliegue y operación en redes HashKey               |
| Despliegue blockchain | Hardhat Ignition        | Desplegar `AureoCore` de forma reproducible           |
| Acceso blockchain     | ethers.js 6             | Consultar logs RPC, recuperar eventos y leer datos    |
| Backend HTTP          | `node:http`             | Exponer salud y reportes                              |
| Backend realtime      | `ws`                    | Publicar veredictos por WebSocket                     |
| Métricas SDK          | JavaScript + `bigint`  | Contadores locales de operaciones y políticas         |
| Análisis IA           | SDK OpenAI              | Consumir APIs compatibles de Groq o xAI                |
| Modelo                | OpenRouter / Groq / xAI | Clasificar riesgo después de las reglas deterministas |
| Cliente               | Commander + `ws`        | CLI para stream y consultas de reportes               |
| Contenedores          | Docker Compose          | Orquestar nodo, despliegue, backend y CLI             |
| Servicio Linux        | systemd                 | Mantener el backend en ejecución en servidores        |
| Calidad               | ESLint + Prettier       | Lint y formato consistente                            |
| Demo                  | `examples/`             | Dapp y casos operativos para probar SDK y contrato    |
| Automatización        | `scripts/setup-env.sh`  | Crear configuración local sin sobrescribir secretos   |

## Node.js y ESM

Los tres workspaces (`blockchain`, `backend` y `cli-client`) usan módulos
ECMAScript mediante `"type": "module"`. El proyecto requiere Node.js 20 o
superior, que aporta soporte estable para `fetch`, WebSocket del ecosistema y
las APIs modernas usadas por las dependencias.

## Blockchain y contratos

### Solidity y OpenZeppelin

`AureoCore` es un registro de metadatos corporativos; no transfiere fondos.
OpenZeppelin aporta componentes probados para:

- `AccessControl`: separar `OPERATOR_ROLE` y `COMPLIANCE_ROLE`.
- `Pausable`: detener nuevas operaciones durante una investigación.

Los eventos del contrato son la interfaz principal para el backend y otros
indexadores.

### Hardhat e Ignition

Hardhat proporciona:

- nodo local en `127.0.0.1:8545`;
- compilación y pruebas del contrato;
- ejecución de scripts de desarrollo.

Hardhat Ignition administra el despliegue del módulo
`blockchain/ignition/modules/AureoCore.js` y permite repetir el proceso sin
codificar manualmente transacciones de despliegue.

Para HSKChain, Hardhat usa presets configurables para Testnet (`chainId 133`,
`https://testnet.hsk.xyz`) y Mainnet (`chainId 177`,
`https://mainnet.hsk.xyz`). Las claves y fondos deben pertenecer a la red
seleccionada.

## Backend

### ethers.js

El backend usa `ethers.JsonRpcProvider` y `eth_getLogs` para recuperar eventos
desde el último bloque persistido. El contrato se instancia con una ABI mínima
que incluye `CorporateTransferRecorded` y `AlertStarted`.

### Servidor HTTP nativo

El backend usa `node:http` en lugar de un framework HTTP. Esto mantiene pequeño
el servicio y deja explícitos:

- `GET /health` para disponibilidad;
- `POST /reports` para consultas;
- el servidor HTTP compartido por el WebSocket `/stream`.

El cuerpo de reportes tiene un límite de 1 MiB y el puerto se valida al iniciar.

### WebSocket (`ws`)

`ws` comparte el servidor HTTP y distribuye cada `risk_verdict` a los clientes
conectados. Los últimos 100 mensajes se restauran desde el estado persistido
para enviarlos al conectarse un nuevo cliente.

### OpenAI SDK, Groq y xAI

El SDK oficial de OpenAI se usa por compatibilidad de API. El backend selecciona
OpenRouter (`https://openrouter.ai/api/v1`), Groq
(`https://api.groq.com/openai/v1`) o xAI (`https://api.x.ai/v1`) mediante
`LLM_PROVIDER`; en modo `auto` prioriza OpenRouter. `OPENROUTER_MODEL`,
`GROQ_MODEL` y `XAI_MODEL`
permiten elegir el modelo. La respuesta solicita JSON, pero siempre se valida
localmente antes de publicarla.

El modelo no sustituye las reglas de negocio: las reglas de velocidad y volumen
se ejecutan antes de llamar a la IA, y el resultado de la IA no puede rebajar
el riesgo mínimo calculado por esas reglas.

## CLI

Commander define los comandos y opciones de `aureo`. La dependencia `ws`
consume `/stream`, mientras que la API HTTP nativa de Node consulta
`/reports`. La CLI no autentica códigos MFA; esa validación debe pertenecer a un
proveedor de identidad integrado en el backend.

## Configuración y secretos

`dotenv` carga variables desde los archivos `.env` de cada workspace. Las
plantillas `.env.example` documentan nombres y valores de desarrollo, pero no
contienen secretos. En producción, las claves deben inyectarse mediante el
gestor de secretos o el mecanismo seguro del entorno de ejecución.

## Docker y operación

La imagen parte de `node:20-bookworm-slim` y usa `npm ci` para instalaciones
reproducibles. `docker-compose.yml` coordina:

1. el nodo Hardhat;
2. el despliegue del contrato;
3. el backend;
4. la CLI opcional mediante el perfil `cli`.

El servicio systemd permite ejecutar el backend como proceso supervisado fuera
de Docker. En ambos casos el backend debe recibir `SIGTERM` para completar su
cierre graceful.

## Calidad y límites actuales

ESLint comprueba errores comunes de JavaScript y Prettier mantiene el formato.
El contrato tiene pruebas Hardhat; el backend actualmente se valida con lint y
comprobaciones de sintaxis, pero todavía no cuenta con una suite automatizada de
integración.

El backend conserva una ventana fallida en la cola para reintentarla en el
siguiente ciclo, y persiste esa cola junto con el cursor de bloques, el
histórico y los veredictos en `BACKEND_STATE_FILE`. La ingesta consulta logs
desde el último bloque guardado, por lo que puede recuperar eventos después de
una desconexión o reinicio y evita duplicados por `transactionHash` y `logIndex`.
Las reglas de montos usan enteros exactos (`bigint`) en lugar de `Number`.
`@aureo/sdk` expone `createMetrics()` y `aureo.metrics.snapshot()` para
contadores locales de operaciones, riesgo, MFA y recomendaciones de bloqueo;
estos contadores viven en memoria y no sustituyen un sistema histórico.
Para producción todavía se recomienda migrar este archivo a una base durable
con transacciones, autenticación del stream, exportación de métricas y backoff
configurable.
