# Cómo funciona Áureo

Esta documentación explica el flujo completo de Áureo, desde el despliegue del contrato hasta la publicación de veredictos de riesgo a través de API, WebSocket y CLI.

## Visión general

Áureo es un middleware open source para aplicaciones Ethereum que necesitan:
- **Observabilidad** de operaciones corporativas on-chain
- **Evaluación de riesgo** mediante reglas deterministas y/o LLM
- **Tooling de wallets** reutilizable mediante el SDK `@aureo/sdk`
- **API/CLI** para consumir los resultados

El proyecto **no custodia fondos** ni reemplaza controles institucionales (HSM, Safe, MPC). Su objetivo es reducir el tiempo entre una señal de riesgo y una respuesta verificable.

## Arquitectura general

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
│ OpenRouter / Groq / xAI│
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

## Componentes y responsabilidades

| Componente | Responsabilidad |
|------------|-----------------|
| `blockchain/` | Contrato `AureoCore`, roles de acceso, eventos empresariales y Circuit Breaker. |
| `backend/` | Ingesta RPC, ventanas de análisis, reglas de riesgo y consulta a OpenRouter/Groq/xAI. |
| `packages/sdk/` | SDK reusable de wallet, monitoring, policies y métricas locales. |
| `cli-client/` | CLI para estado del backend, streams de riesgo y reportes de auditoría. |
| `examples/` | Dapp mínima y casos operativos reproducibles contra Hardhat. |

## Flujo de funcionamiento paso a paso

### 1. Despliegue de `AureoCore`

Se despliega el contrato `AureoCore` usando Hardhat Ignition. Este contrato:
- Registra transferencias corporativas mediante `recordCorporateTransfer()`
- Emite eventos `CorporateTransferRecorded` por cada operación
- Gestiona roles: `OPERATOR_ROLE` (para acciones administrativas) y `COMPLIANCE_ROLE` (para revisiones de riesgo)
- Soporta `Pausable` para detener nuevas operaciones durante investigaciones

### 2. Configuración del backend

El backend necesita:
- `AUREO_CORE_ADDRESS`: dirección del contrato desplegado
- `BLOCKCHAIN_RPC_URL` o `BLOCKCHAIN_WS_URL`: nodo al que conectarse
- `ETH_PRIVATE_KEY` y `ETH_PUBLIC_ADDRESS`: wallet operativa del backend (debe tener roles en el contrato)
- Opcional: claves de LLM (OpenRouter, Groq, xAI) para enriquecimiento de análisis

### 3. Ingesta de eventos

El backend consulta periódicamente al nodo blockchain en busca de nuevos eventos:

1. Recupera logs desde el último bloque persistido (guardado en `BACKEND_STATE_FILE` - por defecto `.runtime/backend-state.json`)
2. Filtra eventos `CorporateTransferRecorded` del contrato `AureoCore`
3. Elimina duplicados por `transactionHash` y `logIndex`
4. Actualiza su cursor de bloque para saber desde dónde continuar después de reinicios

### 4. Ventanas de análisis

Los eventos se agrupan en ventanas temporales (configurable via `BACKEND_WINDOW_MS`, valor por defecto: 60000ms = 60 segundos):

1. El backend collects events that occurred within the window
2. Agrupa las operaciones por iniciador (dirección de origen)
3. Para cada grupo, aplica las reglas deterministas

### 5. Aplicación de reglas deterministas

Se ejecutan **antes** de llamar al proveedor LLM configurado:

#### Regla de velocidad (Speed Rule)
- **Disparador**: más de 3 operaciones de la misma dirección dentro de un rango máximo de 5 bloques consecutivos
- **Resultado**: riesgo `alto`, `bloquear_contrato: true`, `requiere_mfa: false`
- **Significado**: "Demasiadas operaciones rápidas desde una misma wallet"

#### Regla de volumen (Volume Rule)
- **Disparador**: un monto superior a 3x el promedio histórico o a `OPERATIONAL_RESERVE`
- **Resultado**: riesgo mínimo `medio`, `requiere_mfa: true`
- **Significado**: "Monto inusual o por encima de la reserva operativa"

#### Regla de anomalía
- Cualquier otro patrón que el backend detecte como sospechoso

**Importante**: Si no hay LLM disponible (sin claves, cuotas agotadas o errores), el backend usa un veredicto "determinista_degradado" que conserva las reglas locales.

### 6. Publicación de veredictos

Una vez aplicadas las reglas (y opcionalmente enriquecido con LLM), el resultado se publica a través de:

| Canal | Endpoint/URL | Formato |
|-------|-------------|---------|
| **API HTTP** | `GET /health`, `POST /reports` | JSON con veredictos |
| **WebSocket** | `ws://127.0.0.1:3000/stream` | Objetos `risk_verdict` en tiempo real |
| **CLI** | `npm run cli -- stream`, `report`, `status` | Consola local |
| **Métricas** | Prometheus / snapshots locales | Contadores en memoria |
| **Reportes persistidos** | Archivos `.runtime/` | Historial completado |

#### Formato de un mensaje de riesgo (WebSocket):

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

### 7. SDK para dapps (integración opcional)

Las dapps pueden integrar el SDK `@aureo/sdk` sin depender del backend:

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
```

Funcionalidades del SDK:
- Conectar signer Ethereum sin exponer la clave privada al consumidor
- Validar que la dirección pública corresponde a la clave privada
- Suscribirse a eventos EVM por WebSocket con cleanup explícito
- Ejecutar políticas de velocidad y volumen de forma determinista
- Registrar transferencias mediante `createAureoClient` y obtener métricas locales
- `aureo.metrics.snapshot()` mantiene contadores en memoria sin necesidad del backend

## Ejemplo sencillo

```
Wallet A → AureoCore → Wallet B
```

Cuando se registra una transferencia en `AureoCore`:

1. El contrato emite `CorporateTransferRecorded`
2. El backend detecta el evento durante su ventana de análisis
3. Si esta es la 4ta operación de Wallet A en 5 bloques → **riesgo alto**
4. El veredict es publicado por API/WebSocket/CLI

Resultado esperado:

```json
{
  "nivel_riesgo": "alto",
  "motivo": "Más de 3 operaciones en pocos bloques",
  "requiere_mfa": false,
  "bloquear_contrato": true
}
```

**Nota**: Esto indica que la operación parece peligrosa según las reglas, **pero no significa que Áureo pause automáticamente el contrato**. La decisión final corresponde a compliance y a cuentas con los roles adecuados.

## Configuración de ventanas

El tiempo de análisis se configura con `BACKEND_WINDOW_MS` en el archivo `.env` del backend:

- Valor por defecto: `60000` (60 segundos)
- Para pruebas rápidas: `5000` (5 segundos)

Un ventana más larga capturará más operaciones pero aumentará el tiempo antes de generar veredictos.

## Roles y permisos

`AureoCore` gestiona dos roles clave:

| Rol | Permisos |
|-----|----------|
| `OPERATOR_ROLE` | Puede ejecutar acciones administrativas (pausar, etc.) |
| `COMPLIANCE_ROLE` | Puede revisar y marcar operaciones como requiriendo MFA/investigación |

La wallet operativa del backend (`ETH_PRIVATE_KEY`) debe tener uno de estos roles asignados en el contrato antes de firmar acciones administrativas.

## Modos de operación

### Modo con LLM
- Si están configuradas claves de OpenRouter/Groq/xAI, el backend ejecuta reglas deterministas primero
- Luego enriquece el resultado con el modelo de lenguaje
- El modelo no puede rebajar el riesgo mínimo calculado por las reglas

### Modo determinista (degradado)
- Si no hay claves LLM disponibles, el backend usa solo reglas deterministas
- Publica veredicto con `fuente: "determinista_degradado"`
- Las reglas locales siguen siendo aplicadas plenamente

### Modo solo lectura
- Sin `ETH_PRIVATE_KEY` configurada: el backend se conecta solo para leer eventos
- Útil para monitoreo sin capacidades de firma

## Recuperación después de desconexiones

El backend persiste su estado en `.runtime/backend-state.json` incluyendo:
- Cursor del último bloque procesado
- Eventos pendientes en cola
- Histórico de veredictos
- Cola de reintentos fallidos

Al reiniciarse, el backend recupera eventos desde el último bloque guardado y evita procesar duplicados gracias a `transactionHash` y `logIndex`.

## Limitaciones conocidas

- Áureo **no vigila toda la blockchain**, solo los contratos y eventos que el usuario configure
- Solo observa eventos que emitir `AureoCore` (u otros contratos si se configura ABI correctamente)
- No procesa transacciones que no emitan los eventos buscados
- Las pausas automáticas no están implementadas; `bloquear_contrato` es una recomendación de compliance
- El estado local (JSON) no es adecuado para múltiples instancias sin una base de datos compartida

## Próximas mejoras planeadas

- Base de datos compartida para múltiples instancias
- Autenticación y autorización de API/WebSocket
- Gestión segura de secretos con Vault/KMS
- Política formal de MFA e identidad integrada
- Exportación de métricas a Prometheus/OpenTelemetry
- Pruebas de integración contra redes objetivo
- Política formal de pausado y congelamiento de contrato