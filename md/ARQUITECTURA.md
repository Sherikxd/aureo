# Áureo

Áureo es un monorepo ESM de middleware open source para aplicaciones Ethereum:
observabilidad, seguridad, wallet tooling y evaluación de políticas en tiempo
real. El flujo principal es:

```text
Contrato AureoCore -> WebSocket RPC -> backend (ventana temporal) -> xAI/Grok
       ^                       |                         |
       |                       +---- CLI stream <--------+
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

### Backend

El proveedor `ethers.WebSocketProvider` recibe eventos sin polling. El colector
agrupa los eventos en ventanas de un minuto y entrega una instantánea al analizador.
El SDK oficial de OpenAI se configura con `baseURL=https://api.x.ai/v1` para usar
`grok-4.6`. `response_format: { type: "json_object" }` reduce respuestas libres,
pero `validateVerdict` vuelve a validar tipos, enum y campos obligatorios antes de
publicar un veredicto. Las credenciales se obtienen exclusivamente de `.env`.

El backend puede crear una wallet Ethereum con `ethers.Wallet` a partir de
`ETH_PRIVATE_KEY`, conectarla al provider y verificarla contra
`ETH_PUBLIC_ADDRESS`. La wallet del backend es distinta de la wallet de
despliegue (`DEPLOYER_PRIVATE_KEY`) y debe recibir explícitamente el rol
necesario en el contrato. Sin clave privada, el backend se mantiene en modo solo
lectura. El endpoint `GET /wallet` expone únicamente la dirección pública y el
estado del signer, nunca la clave.

Antes de invocar a Grok se ejecutan reglas deterministas. Si una misma dirección
aparece en más de tres transferencias cuyo rango ocupa como máximo cinco bloques
consecutivos, el veredicto es inmediatamente `alto` y
`bloquear_contrato: true`, incluso si el modelo no está disponible. Para volumen,
el backend mantiene los últimos logs por iniciador: una transacción superior a
tres veces el promedio histórico o a `OPERATIONAL_RESERVE` se marca como mínimo
`medio` y `requiere_mfa: true`. El CLI solicita el código MFA, pero la validación
real debe delegarse a un proveedor de identidad; nunca se considera autenticada
solo por recibir texto.

Los niveles de alerta válidos son 1–4 y las entradas con dirección, monto o
motivo inválidos se rechazan con errores custom. En producción, el colector debe
añadir persistencia idempotente por hash de log,
reintentos con backoff, métricas, autenticación del stream y una cola duradera
antes de la llamada al modelo. La lógica de riesgo no debe pausar automáticamente
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
│   └── src/{analyzer.js,index.js,wallet.js}
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
│   └── src/{index.js,wallet.js,monitor.js,policy.js}
├── md/ARQUITECTURA.md
├── md/BACKEND.md
├── md/CLI.md
├── md/TECNOLOGIAS.md
├── Dockerfile
├── docker-compose.yml
├── scripts/
│   ├── deploy-backend.sh
│   ├── deploy-blockchain.sh
│   └── install-systemd.sh
├── deploy/systemd/aureo-backend.service
├── eslint.config.js
├── package.json
└── .prettierrc.json
```

## Operación local

1. Instalar dependencias con `npm install`.
2. Copiar cada `.env.example` a `.env` y completar la dirección del contrato y
   `XAI_API_KEY`.
3. Ejecutar `npm --workspace blockchain run node`.
4. Desplegar con `npm --workspace blockchain run deploy:local`.
5. Iniciar el backend y, en otra terminal, `npm run cli -- stream`.

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
El inventario de tecnologías está en [`TECNOLOGIAS.md`](TECNOLOGIAS.md).
