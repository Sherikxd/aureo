# Backend de Áureo

Guía para configurar, ejecutar y verificar el backend que conecta los eventos
de `AureoCore` con el analizador de riesgo y los clientes HTTP/WebSocket.

## Requisitos

- Node.js 20 o superior.
- npm 10 o superior.
- Un nodo RPC compatible con WebSocket.
- Un contrato `AureoCore` desplegado.
- Una clave de xAI para generar análisis con Grok.

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

Copia la plantilla:

```bash
cp backend/.env.example backend/.env
```

Completa al menos estas variables:

```dotenv
BLOCKCHAIN_WS_URL=ws://127.0.0.1:8545
AUREO_CORE_ADDRESS=0x...
XAI_API_KEY=...
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
| `XAI_BASE_URL`        | `https://api.x.ai/v1` | Endpoint compatible con OpenAI          |
| `XAI_MODEL`           |            `grok-4.6` | Modelo usado por el analizador          |
| `OPERATIONAL_RESERVE` |                 vacío | Umbral de volumen que activa MFA        |
| `BACKEND_PORT`        |                `3000` | Puerto HTTP y WebSocket                 |
| `BACKEND_LOG_LEVEL`   |                `info` | Reservada para configuración de logging |
| `ETH_PRIVATE_KEY`     |                 vacío | Clave privada de la wallet operativa    |
| `ETH_PUBLIC_ADDRESS`  |                 vacío | Dirección pública esperada de la wallet |

No guardes `backend/.env` en el repositorio ni compartas `XAI_API_KEY`.

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
  los últimos veredictos almacenados en memoria.
- `WS /stream`: envía veredictos nuevos y, al conectarse, los últimos veredictos
  disponibles.

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
cp cli-client/.env.example cli-client/.env
npm run cli -- stream
```

También puedes probar el handshake con una herramienta compatible con
WebSocket, usando `ws://127.0.0.1:3000/stream`.

## 7. Flujo de procesamiento

1. `ethers.WebSocketProvider` escucha `CorporateTransferRecorded`.
2. Los eventos se acumulan durante una ventana de un minuto.
3. Las reglas deterministas revisan velocidad y volumen.
4. Si no existe una regla inmediata, el analizador consulta xAI/Grok.
5. La respuesta se valida contra los niveles `bajo`, `medio`, `alto` y
   `critico`.
6. El veredicto se guarda en memoria y se publica por `/stream`.
7. Las cantidades recientes por iniciador alimentan la siguiente ventana.

El buffer de eventos está limitado a 10.000 entradas y el historial de
veredictos a 100 entradas. Estos límites evitan crecimiento ilimitado de
memoria, pero no sustituyen una cola o una base de datos en producción.

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
cp backend/.env.example backend/.env
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
| `XAI_API_KEY es obligatorio`              | Configura la clave sin comillas extra ni espacios.                                  |
| No conecta al RPC                         | Comprueba que Hardhat esté activo y que `BLOCKCHAIN_WS_URL` use `ws://` o `wss://`. |
| `/health` responde pero no llegan eventos | Verifica dirección, ABI desplegada y conexión WebSocket al nodo.                    |
| `/stream` se desconecta                   | Revisa el proxy, el puerto `3000` y que permita upgrade WebSocket.                  |
| `POST /reports` responde `400`            | Envía JSON válido con un campo `query` no vacío.                                    |
