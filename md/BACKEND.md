# Backend de Áureo

Guía para configurar, ejecutar y verificar el backend que conecta los eventos
de `AureoCore` con el analizador de riesgo y los clientes HTTP/WebSocket.

## Requisitos

- Node.js 20 o superior.
- npm 10 o superior.
- Un nodo RPC HTTP compatible con `eth_getLogs`.
- Un contrato `AureoCore` desplegado.
- Una clave de xAI para enriquecer análisis con Grok (opcional; existe modo
  degradado determinista).

El backend no mueve fondos ni ejecuta automáticamente las recomendaciones de
bloqueo. Publica veredictos auditables para que una política externa decida la
acción correspondiente.

El backend consume `@aureo/sdk`, que también puede utilizarse directamente en
otras aplicaciones Ethereum. Para integrar solo el middleware de wallet,
monitorización o políticas, consulta
[`packages/sdk/README.md`](../packages/sdk/README.md).

## 1. Instalar el proyecto

Desde la raíz del monorepo:

```bash
npm ci
```

Para instalaciones locales de desarrollo puede usarse `npm install`, pero los
despliegues reproducibles deben usar `npm ci`.

## 2. Configurar las variables

Genera las plantillas:

```bash
npm run setup:env
```

Completa al menos estas variables:

```dotenv
BLOCKCHAIN_WS_URL=ws://127.0.0.1:8545
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
AUREO_CORE_ADDRESS=0x...
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=openai/gpt-oss-20b
OPENROUTER_HTTP_REFERER=http://127.0.0.1:3000
OPENROUTER_APP_NAME=Aureo
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=openai/gpt-oss-20b
XAI_API_KEY=...
XAI_TIMEOUT_MS=15000
XAI_MAX_RETRIES=2
XAI_RETRY_DELAY_MS=500
BACKEND_STATE_FILE=.runtime/backend-state.json
```

Para habilitar la wallet Ethereum operativa del backend:

```dotenv
ETH_PRIVATE_KEY=0x...
ETH_PUBLIC_ADDRESS=0x...
```

`ETH_PUBLIC_ADDRESS` se compara con la dirección derivada de
`ETH_PRIVATE_KEY` al iniciar. Si no se configuran, el backend permanece en modo
solo lectura. La wallet debe tener `OPERATOR_ROLE` o `COMPLIANCE_ROLE` en
`AureoCore` para firmar acciones administrativas. Nunca guardes la clave
privada en Git; en producción usa Vault, KMS, HSM, Safe o MPC.

Variables opcionales:

| Variable              |        Predeterminado | Uso                                     |
| --------------------- | --------------------: | --------------------------------------- |
| `LLM_PROVIDER`        | `openrouter`          | `openrouter`, `groq`, `xai`, `none` o selección automática |
| `LLM_FALLBACK_PROVIDERS` | `groq,xai` | Proveedores alternativos separados por coma |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Endpoint de OpenRouter |
| `OPENROUTER_MODEL` | `openai/gpt-oss-20b` | Modelo usado en OpenRouter |
| `OPENROUTER_HTTP_REFERER` | `http://127.0.0.1:3000` | Referencia opcional para OpenRouter |
| `OPENROUTER_APP_NAME` | `Aureo` | Nombre opcional de la aplicación |
| `GROQ_BASE_URL`       | `https://api.groq.com/openai/v1` | Endpoint de Groq |
| `GROQ_MODEL`          | `openai/gpt-oss-20b` | Modelo usado en Groq |
| `LLM_TIMEOUT_MS`      |              `15000` | Timeout común de proveedores (ms) |
| `LLM_MAX_RETRIES`     |                  `2` | Reintentos comunes de proveedores |
| `LLM_RETRY_DELAY_MS`  |                `500` | Espera inicial común entre reintentos |
| `XAI_BASE_URL`        | `https://api.x.ai/v1` | Endpoint compatible con OpenAI          |
| `XAI_MODEL`           |            `grok-4.6` | Modelo usado en xAI                     |
| `XAI_TIMEOUT_MS`       |              `15000` | Timeout de cada solicitud al LLM (ms)   |
| `XAI_MAX_RETRIES`      |                  `2` | Reintentos después de un fallo          |
| `XAI_RETRY_DELAY_MS`   |                `500` | Espera inicial entre reintentos (ms)    |
| `OPERATIONAL_RESERVE` |                 vacío | Umbral de volumen que activa MFA        |
| `SPEED_THRESHOLD`     |                      `3` | Operaciones que activan velocidad       |
| `SPEED_BLOCK_WINDOW`  |                      `4` | Diferencia máxima de bloques             |
| `VOLUME_MULTIPLIER`   |                      `3` | Multiplicador del histórico              |
| `EMA_ALPHA`           |                    `0.3` | Alpha de tendencia histórica             |
| `ALERT_WEBHOOK_URLS`  | vacío | URLs separadas por coma para alertas altas/críticas |
| `BACKEND_PORT`        |                `3000` | Puerto HTTP y WebSocket                 |
| `BACKEND_WINDOW_MS`   |              `60000` | Ventana de agrupación antes del análisis |
| `BLOCKCHAIN_RPC_URL`  | `BLOCKCHAIN_WS_URL` convertido a HTTP | RPC para recuperar logs y hacer backfill |
| `BLOCKCHAIN_CONFIRMATIONS` | `0` | Confirmaciones mínimas antes de analizar un bloque |
| `BLOCKCHAIN_MAX_BLOCK_RANGE` | `2000` | Máximo de bloques por consulta `eth_getLogs` |
| `BACKEND_STATE_FILE`  | `.runtime/backend-state.json` | Cursor, cola, históricos y veredictos |
| `BACKEND_LOG_LEVEL`   |                `info` | Reservada para configuración de logging |
| `ETH_PRIVATE_KEY`     |                 vacío | Clave privada de la wallet operativa    |
| `ETH_PUBLIC_ADDRESS`  |                 vacío | Dirección pública esperada de la wallet |

No guardes `backend/.env` en el repositorio ni compartas `GROQ_API_KEY` o
`XAI_API_KEY`.

## 3. Preparar la blockchain local

En una terminal, inicia Hardhat:

```bash
npm --workspace blockchain run node
```

En otra terminal, compila y despliega el contrato:

```bash
npm --workspace blockchain run compile
npm --workspace blockchain run deploy:local
```

El despliegue genera la dirección del contrato. Asigna esa dirección a
`AUREO_CORE_ADDRESS` en `backend/.env`.

El backend consulta los logs mediante `BLOCKCHAIN_RPC_URL` desde el último
bloque persistido. Así recupera eventos emitidos durante una desconexión o
reinicio, aunque `BLOCKCHAIN_WS_URL` siga siendo la URL documentada para el
endpoint WebSocket de la API.

## 4. Iniciar el backend

Desde la raíz:

```bash
npm run backend:start
```

O directamente desde el workspace:

```bash
npm --workspace backend run start
```

Una ejecución correcta muestra el puerto HTTP y la URL RPC observada. El
proceso debe permanecer en primer plano para que Docker, systemd u otro
supervisor gestione su ciclo de vida.

## 5. Comprobar la disponibilidad

El endpoint de salud no requiere autenticación:

```bash
curl http://127.0.0.1:3000/health
```

La identidad pública de la wallet puede comprobarse sin exponer la clave:

```bash
curl http://127.0.0.1:3000/wallet
```

Respuesta esperada:

```json
{ "status": "ok" }
```

El backend también expone:

- `POST /reports`: recibe `{ "query": "..." }` y devuelve la consulta junto con
  los últimos veredictos almacenados en `BACKEND_STATE_FILE`.
- `WS /stream`: envía veredictos nuevos y, al conectarse, los últimos veredictos
  disponibles.
  `GET /metrics` devuelve contadores en formato Prometheus para veredictos,
  riesgo, eventos procesados, análisis de ventanas y llamadas al LLM.

Ejemplo de reportes:

```bash
curl -X POST http://127.0.0.1:3000/reports \
  -H 'content-type: application/json' \
  -d '{"query":"Resume las alertas críticas"}'
```

El cuerpo de `/reports` está limitado a 1 MiB. Una consulta vacía o un JSON
inválido devuelve `400`; un cuerpo demasiado grande devuelve `413`.

## 6. Verificar el stream

Con la CLI del proyecto:

```bash
npm run setup:env
npm run cli -- stream
```

También puedes probar el handshake con una herramienta compatible con
WebSocket, usando `ws://127.0.0.1:3000/stream`.

## 7. Flujo de procesamiento

1. El RPC consulta `CorporateTransferRecorded` desde el último bloque guardado.
2. Los eventos recuperados se deduplican y se acumulan durante una ventana de un minuto.
3. Las reglas deterministas revisan velocidad y volumen.
4. Si no existe una regla inmediata y hay un proveedor LLM configurado, el analizador envía
   únicamente iniciador, monto y bloque al LLM.
5. Cada solicitud tiene timeout y hasta `XAI_MAX_RETRIES` reintentos con
   backoff exponencial.
6. La respuesta se valida contra los niveles `bajo`, `medio`, `alto` y
   `critico`, y se fuerzan coherencias: riesgo alto/crítico implica bloqueo y
   volumen elevado implica MFA.
7. Si el proveedor seleccionado no está configurado o falla después de los
   reintentos, se publica un
   veredicto `determinista_degradado`; la ventana no se pierde ni queda
   reintentándose indefinidamente.
8. El veredicto se persiste y se publica por `/stream`.
9. Las cantidades recientes por iniciador alimentan la siguiente ventana.

La cola pendiente está limitada a 10.000 entradas y el historial de veredictos
a 100 entradas. El estado se conserva en el archivo configurado, pero en
producción con varias instancias debe usarse una base o cola compartida.

## 8. Detener el servicio

El backend maneja `SIGINT` y `SIGTERM` para detener intervalos, listeners del
contrato, clientes WebSocket, servidor HTTP y proveedor blockchain:

```bash
Ctrl+C
```

En systemd:

```bash
sudo systemctl stop aureo-backend
sudo systemctl status aureo-backend
```

## 9. Docker Compose

El flujo completo de desarrollo puede iniciarse con:

```bash
npm run setup:env
docker compose up --build
```

Compose inicia el nodo blockchain, despliega el contrato y arranca el backend
con la dirección generada en el volumen interno de runtime. Para consumir el
stream desde la CLI:

```bash
docker compose --profile cli run --rm cli
```

Logs del backend:

```bash
docker compose logs -f backend
```

## 10. Validación antes de desplegar

Ejecuta desde la raíz:

```bash
npm run lint
npm --workspace backend run lint
```

Para revisar también el contrato:

```bash
npm run blockchain:compile
npm run blockchain:test
```

## Solución de problemas

| Síntoma                                   | Revisión                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| `AUREO_CORE_ADDRESS es obligatorio`       | Define la dirección desplegada en `backend/.env`.                                   |
| `GROQ_API_KEY/XAI_API_KEY es obligatorio` | No son obligatorias: sin claves se usa el modo determinista degradado.              |
| No conecta al RPC                         | Comprueba que Hardhat esté activo y que `BLOCKCHAIN_RPC_URL` use `http://` o `https://`. |
| `/health` responde pero no llegan eventos | Verifica dirección, ABI, `BLOCKCHAIN_RPC_URL` y el cursor en `BACKEND_STATE_FILE`. |
| `/stream` se desconecta                   | Revisa el proxy, el puerto `3000` y que permita upgrade WebSocket.                  |
| `POST /reports` responde `400`            | Envía JSON válido con un campo `query` no vacío.                                    |

Si aparecen veredictos `determinista_degradado`, revisa `LLM_PROVIDER`, la
conectividad con Groq/xAI, los timeouts, reintentos y la cuota del proveedor. El sistema
mantiene las reglas locales activas mientras el LLM no esté disponible.
