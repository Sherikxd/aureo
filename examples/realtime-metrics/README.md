# Integración de métricas en tiempo real

Este proyecto de ejemplo muestra cómo integrar el backend de Áureo con un
monitor de métricas operativo. Combina:

- `GET /health` para disponibilidad del backend y estado de la wallet;
- `WS /stream` para contar veredictos en tiempo real;
- `@aureo/sdk` para centralizar el conteo de riesgo, MFA y bloqueos;
- reconexión automática del stream;
- salida humana para terminal o JSON para automatización.

No modifica la blockchain, no firma transacciones y no almacena claves.

## Inicio rápido

Desde la raíz del monorepo, inicia un entorno local completo:

```bash
npm run setup:env -- --skip-wallet
npm run start:local
```

En otra terminal inicia el panel:

```bash
npm run metrics:realtime
```

El panel se actualiza cada cinco segundos por defecto. Cuando el backend
publique un `risk_verdict`, los contadores se actualizan inmediatamente.

## Configuración

Copia `.env.example` a `.env` si necesitas cambiar valores:

```dotenv
AUREO_BACKEND_URL=http://127.0.0.1:3000
AUREO_STREAM_URL=ws://127.0.0.1:3000/stream
METRICS_REFRESH_MS=5000
METRICS_OUTPUT=pretty
```

También puedes ejecutar el workspace directamente:

```bash
npm --workspace @aureo/realtime-metrics run start
```

## Métricas mostradas

| Métrica | Fuente |
| --- | --- |
| Estado del backend | `/health` |
| Wallet operativa configurada | `/health.wallet.configured` |
| Estado del WebSocket | conexión `/stream` |
| Total de veredictos | `@aureo/sdk` a partir de mensajes `risk_verdict` |
| Conteo por riesgo | `createMetrics().recordVerdict()` |
| MFA requerida | `createMetrics().recordVerdict()` |
| Recomendaciones de bloqueo | `createMetrics().recordVerdict()` |
| Último mensaje | timestamp de recepción local |
| Reconexiones y errores | ciclo de vida de la integración |

## Salida JSON

Para conectarlo a otro proceso:

```bash
METRICS_OUTPUT=json npm run metrics:realtime
```

Cada línea es un snapshot JSON. Ejemplo:

```json
{
  "timestamp": "2026-09-19T23:00:00.000Z",
  "uptimeSeconds": 42,
  "backend": { "connected": true, "status": "ok", "walletConfigured": false },
  "stream": { "connected": true, "reconnects": 0, "lastMessageAt": null },
  "verdicts": {
    "total": 0,
    "byRisk": {},
    "mfaRequired": 0,
    "contractBlocks": 0
  },
  "errors": 0
}
```

La integración mantiene contadores desde su inicio mediante `@aureo/sdk`; no pretende reemplazar una
base de métricas histórica. Para producción, exporta estos snapshots a
Prometheus, OpenTelemetry, Grafana Cloud o el sistema de observabilidad
institucional.

## Probar la integración

Con el panel activo, ejecuta un caso que produzca veredictos:

```bash
npm run demo:case -- speed
```

Si el backend está configurado con una ventana de análisis de un minuto,
espera hasta que termine esa ventana. Para desarrollo rápido, define
`BACKEND_WINDOW_MS=5000` en `backend/.env` y reinicia el backend.

El runner de casos consulta `/health` y reutiliza la dirección de `AureoCore`
que el backend está observando. No ejecutes `deploy:blockchain` entre
`start:local` y `demo:case`, porque eso cambiaría la dirección del contrato
mientras el backend sigue apuntando a la anterior.
Para obtener resultados más rápidos en desarrollo, puedes usar
`BACKEND_WINDOW_MS=5000` en `backend/.env`; el valor recomendado por defecto
para producción sigue siendo `60000`.

## Limitaciones y seguridad

- El stream y `/health` deben protegerse con TLS y autenticación antes de
  exponerse fuera de una red confiable.
- Los contadores se reinician al reiniciar el proceso.
- La integración no interpreta ni valida MFA; solo cuenta el campo del
  veredicto.
- `contractBlocks` representa recomendaciones del backend, no pausas ejecutadas
  en la blockchain.
