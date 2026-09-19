# Áureo

Plataforma empresarial de observabilidad, compliance e inteligencia de datos
Web3 en tiempo real.

Áureo escucha eventos corporativos emitidos por contratos inteligentes, aplica
reglas deterministas de riesgo, consulta a Grok para enriquecer el análisis y
publica los veredictos mediante API HTTP, WebSocket y una CLI para Linux.

## Arquitectura

```text
┌─────────────────────┐
│ AureoCore.sol       │
│ Hardhat + Ignition  │
└──────────┬──────────┘
           │ eventos por WebSocket
           v
┌─────────────────────┐
│ Backend Node.js     │
│ ethers + reglas     │
│ xAI / grok-4.6      │
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

| Componente    | Responsabilidad                                                                 |
| ------------- | ------------------------------------------------------------------------------- |
| `blockchain/` | Contrato `AureoCore`, roles de acceso, eventos empresariales y Circuit Breaker. |
| `backend/`    | Ingesta WebSocket, ventanas de análisis, reglas de riesgo y consulta a xAI.     |
| `cli-client/` | Streaming de veredictos y consultas de reportes desde terminal.                 |
| `scripts/`    | Despliegue local, despliegue Docker y servicio systemd.                         |
| `md/`         | Arquitectura, desarrollo local y manual de CLI.                                 |
| `.copilot/`   | Reglas de contexto y hook de pre-commit.                                        |

## Requisitos

Para desarrollo manual:

- Node.js 20 o superior.
- npm 10 o superior.
- Docker Engine y Docker Compose v2, recomendado para el entorno completo.

Para análisis con Grok se necesita una clave `XAI_API_KEY`.

## Inicio rápido con Docker

### 1. Configurar secretos

```bash
cp backend/.env.example backend/.env
cp cli-client/.env.example cli-client/.env
```

Edita `backend/.env` y establece al menos:

```dotenv
XAI_API_KEY=tu-clave-de-xai
OPERATIONAL_RESERVE=100000
```

No guardes claves reales en Git ni en archivos Docker versionados.

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

Respuesta esperada:

```json
{ "status": "ok" }
```

### 4. Usar la CLI

Desde el host:

```bash
npm run cli -- stream
npm run cli -- report "Resume los veredictos recientes"
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

```bash
npm install
cp blockchain/.env.example blockchain/.env
cp backend/.env.example backend/.env
cp cli-client/.env.example cli-client/.env
```

En `backend/.env`, configura:

```dotenv
BLOCKCHAIN_WS_URL=ws://127.0.0.1:8545
AUREO_CORE_ADDRESS=0x...
XAI_API_KEY=tu-clave-de-xai
XAI_BASE_URL=https://api.x.ai/v1
XAI_MODEL=grok-4.6
BACKEND_PORT=3000
OPERATIONAL_RESERVE=100000
```

Después, en terminales separadas:

```bash
npm --workspace blockchain run node
npm run deploy:blockchain
npm run deploy:backend
npm run cli -- stream
```

El despliegue local requiere que el nodo Hardhat ya esté ejecutándose. Para
servidores Linux con systemd:

```bash
sudo npm run deploy:systemd
```

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
- [Desarrollo con Docker](md/DEVELOPMENT.md)
- [Manual de la CLI](md/CLI.md)

## Estado de producción

La base está preparada para desarrollo y pruebas locales. Antes de producción
deben añadirse persistencia idempotente de logs, cola duradera, autenticación
del WebSocket, métricas, gestión segura de secretos, reintentos con backoff,
política formal de MFA y pruebas de integración contra la red objetivo.
