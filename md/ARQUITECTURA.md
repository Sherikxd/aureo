# Áureo

Áureo es un monorepo ESM de middleware open source para aplicaciones Ethereum:
observabilidad, seguridad, wallet tooling y evaluación de políticas en tiempo
real. El flujo principal es:

```text
Contrato AureoCore -> SDK o RPC por bloques -> políticas locales
                                      -> backend (ventana temporal) -> OpenRouter/Groq/xAI
       ^                    |                         |
       |                    +---- CLI stream <--------+
       +---------- Circuit Breaker / alerta de compliance
```

## Componentes

El núcleo reusable está en `packages/sdk/`. El backend y la CLI son una
implementación de referencia que demuestra cómo consumirlo; no son requisitos
para integrar el SDK en otra dapp.

### Blockchain

`AureoCore` es un registro auditable, no un procesador de fondos. Los operadores
registran transferencias corporativas y el rol de compliance inicia alertas. Cada
transferencia se persiste por `operationId` y puede consultarse con
`getCorporateTransfer`; las alertas tienen un contador independiente y se
consultan con `getAlert`. Cada acción emite un evento indexable por `operationId`
o `reference`. `AccessControl`
separa `OPERATOR_ROLE` y `COMPLIANCE_ROLE`; `Pausable` proporciona el Circuit
Breaker para detener nuevas operaciones durante una investigación. El despliegue
usa Hardhat Ignition, y la red local es `127.0.0.1:8545`.

### Casos de uso reales

- **Tesorería corporativa:** registrar el identificador de una orden o factura,
  quién inició la operación, beneficiario y monto para conciliación posterior
  con ERP, banco o custodio. Áureo aporta evidencia inmutable; no sustituye la
  autorización ni la liquidación de fondos.
- **Compliance y AML:** abrir una alerta asociada a una referencia cuando una
  operación requiere revisión, conservar nivel, motivo y responsable, y
  consultar el expediente desde un indexador autorizado.
- **Control operativo:** pausar nuevas escrituras durante una investigación o
  incidente de infraestructura y reanudar después de una decisión aprobada.
- **Monitoreo de wallets y dapps:** consumir eventos por WebSocket, aplicar
  políticas deterministas de velocidad/volumen y publicar un veredicto a un
  dashboard, SIEM o flujo de MFA.

El flujo demostrable está en [`DEVELOPMENT.md`](DEVELOPMENT.md). El contrato no
custodia activos, no comprueba saldos bancarios y `bloquear_contrato` es una
recomendación del analizador, no una orden automática de congelamiento.

### Backend

El backend consulta logs por RPC desde el último bloque persistido, recupera
eventos después de reinicios o desconexiones y elimina duplicados por
`transactionHash` y `logIndex`. El colector agrupa los eventos en ventanas de un
minuto y entrega una instantánea al analizador.
La misma ingesta funciona sobre HashKey Chain: `BLOCKCHAIN_CONFIRMATIONS`
retrasa el análisis hasta alcanzar finality suficiente y
`BLOCKCHAIN_MAX_BLOCK_RANGE` evita consultas RPC excesivamente grandes.
El SDK ofrece un camino independiente: `createAureoClient` puede registrar una
transferencia, evaluar su política inmediatamente y actualizar
`aureo.metrics.snapshot()` sin esperar al backend ni a un WebSocket.
El SDK oficial de OpenAI se configura con `baseURL=https://api.x.ai/v1` para usar
`grok-4.6`. Cada solicitud tiene timeout y reintentos limitados. Solo se envían
al LLM los campos necesarios para clasificar el riesgo; no se envían
beneficiarios, referencias internas ni identificadores de deduplicación.
`response_format: { type: "json_object" }` reduce respuestas libres, pero
`validateVerdict` vuelve a validar tipos, enum y coherencia antes de publicar un
veredicto. Las credenciales se obtienen exclusivamente de `.env`.

El backend puede crear una wallet Ethereum con `ethers.Wallet` a partir de
`ETH_PRIVATE_KEY`, conectarla al provider y verificarla contra
`ETH_PUBLIC_ADDRESS`. La wallet del backend es distinta de la wallet de
despliegue (`DEPLOYER_PRIVATE_KEY`) y debe recibir explícitamente el rol
necesario en el contrato. Sin clave privada, el backend se mantiene en modo solo
lectura. El endpoint `GET /wallet` expone únicamente la dirección pública y el
estado del signer, nunca la clave.

Antes de invocar al proveedor LLM configurado se ejecutan reglas deterministas. Si una misma dirección
aparece en más de tres transferencias cuyo rango ocupa como máximo cinco bloques
consecutivos, el veredicto es inmediatamente `alto` y
`bloquear_contrato: true`, incluso si el modelo no está disponible. Para volumen,
el backend mantiene los últimos logs por iniciador: una transacción superior a
tres veces el promedio histórico o a `OPERATIONAL_RESERVE` se marca como mínimo
`medio` y `requiere_mfa: true`. El CLI solicita el código MFA, pero la validación
real debe delegarse a un proveedor de identidad; nunca se considera autenticada
solo por recibir texto.

Los niveles de alerta válidos son 1–4 y las entradas con dirección, monto o
motivo inválidos se rechazan con errores custom. Si el LLM no está configurado o
falla, el backend usa un veredicto determinista degradado y conserva las reglas
locales. El estado local se guarda en `BACKEND_STATE_FILE`; para producción con
varias instancias debe migrarse a una base transaccional compartida. La lógica de riesgo no debe pausar automáticamente
sin una política aprobada: `bloquear_contrato` es una recomendación auditable.

### CLI

`aureo stream` consume el stream de veredictos y `aureo report "<pregunta>"`
consulta reportes HTTP. La CLI cierra el WebSocket en `SIGINT` y devuelve códigos
de salida no cero ante errores para integrarse con automatización de Linux.

## Estructura

```text
.
├── .copilot/
│   ├── .copilot-instructions.md
│   └── hooks/pre-commit
├── backend/
│   ├── .env.example
│   ├── package.json
│   └── src/{analyzer.js,index.js,state.js,wallet.js}
├── blockchain/
│   ├── .env.example
│   ├── contracts/AureoCore.sol
│   ├── hardhat.config.js
│   ├── ignition/modules/AureoCore.js
│   └── package.json
├── cli-client/
│   ├── .env.example
│   ├── package.json
│   └── src/index.js
├── packages/sdk/
│   ├── README.md
│   └── src/{client.js,index.js,wallet.js,monitor.js,policy.js,metrics.js}
├── md/ARQUITECTURA.md
├── md/BACKEND.md
├── md/Ejemplos_Casos.md
├── md/CLI.md
├── md/SCRIPTS.md
├── md/TECNOLOGIAS.md
├── md/HASHKEY.md
├── md/prompts/README.md
├── Dockerfile
├── docker-compose.yml
├── scripts/
│   ├── deploy-backend.sh
│   ├── deploy-blockchain.sh
│   └── install-systemd.sh
├── examples/
│   ├── cases/
│   └── demo-dapp/
├── deploy/systemd/aureo-backend.service
├── eslint.config.js
├── package.json
└── .prettierrc.json
```

## Operación local

1. Instalar dependencias con `npm install`.
2. Copiar cada `.env.example` a `.env` y completar la dirección del contrato.
   `XAI_API_KEY` solo es necesaria para enriquecer el análisis con xAI.
3. Ejecutar `npm --workspace blockchain run node`.
4. Desplegar con `npm --workspace blockchain run deploy:local`.
5. Iniciar el backend y, en otra terminal, `npm run cli -- status` o
   `npm run cli -- stream`.

## Pruebas y calidad

El contrato se valida con Hardhat y cubre despliegue seguro, persistencia de
transferencias y alertas, separación de roles, errores de entrada, circuito de
pausa y consultas de identificadores inexistentes:

```bash
npm run blockchain:compile
npm run blockchain:test
npm run lint
```

Las transferencias no mueven fondos: almacenan metadatos de auditoría. Los
eventos son la interfaz recomendada para indexadores y `getCorporateTransfer` /
`getAlert` sirven para verificaciones puntuales desde integraciones autorizadas.

## Despliegue

Los scripts de `scripts/` no guardan secretos ni ejecutan comandos destructivos.
`deploy-blockchain.sh localhost` compila y despliega con Ignition contra un nodo
Hardhat ya iniciado. `deploy-backend.sh` valida `backend/.env`, instala con
`npm ci`, ejecuta lint y deja el proceso en primer plano para que Docker,
systemd o un supervisor gestione su ciclo de vida. En un servidor Linux con
systemd puede instalarse el servicio con `sudo npm run deploy:systemd`.

La guía operativa del cliente está en [`CLI.md`](CLI.md).
La guía paso a paso del backend está en [`BACKEND.md`](BACKEND.md).
Los flujos reales están documentados en [`Ejemplos_Casos.md`](Ejemplos_Casos.md).
El inventario de tecnologías está en [`TECNOLOGIAS.md`](TECNOLOGIAS.md).
La referencia de automatización está en [`SCRIPTS.md`](SCRIPTS.md).
