# CLI de Áureo

Cliente de terminal para consultar el estado del backend, observar veredictos
de riesgo en tiempo real y solicitar reportes de auditoría.

## Requisitos

- Node.js 20 o superior.
- Backend de Áureo disponible por HTTP.
- WebSocket habilitado para el comando `stream`.

La CLI no firma transacciones, no custodia fondos y no necesita una clave
privada para sus comandos actuales.

## Configuración

Copia las variables en `cli-client/.env` o expórtalas en el entorno:

```dotenv
AUREO_BACKEND_URL=http://127.0.0.1:3000
AUREO_STREAM_URL=ws://127.0.0.1:3000/stream
```

También puedes configurar el entorno completo desde la raíz:

```bash
npm run setup:env -- --skip-wallet
```

La opción `--skip-wallet` evita solicitar una wallet porque la CLI solo consume
la API y el stream.

## Ejecutar

Desde la raíz del monorepo:

```bash
npm run cli -- --help
npm run cli -- status
npm run cli -- stream
npm run cli -- report "Resume los veredictos recientes"
```

Como binario local:

```bash
npm --workspace cli-client link
aureo --help
```

## Comandos

### `status`

Comprueba `/health` y `/wallet` en paralelo:

```bash
aureo status
aureo status --url http://127.0.0.1:3000 --json
```

La salida de terminal resume el backend, el estado y la wallet:

```text
Backend: http://127.0.0.1:3000
Estado: ok
Wallet: 0x...
```

Usa `--json` en scripts y sistemas de monitoreo.

### `stream`

Abre una conexión WebSocket a `/stream`:

```bash
aureo stream
aureo stream --url ws://backend.example.com/stream
```

El stream muestra únicamente veredictos nuevos por defecto. Esto evita que
registros antiguos o respuestas de un proveedor LLM que ya no está configurado
aparezcan como si fueran análisis actuales. Para solicitar explícitamente el
histórico persistido:

```bash
aureo stream --history
```

Formatos disponibles:

```bash
aureo stream --format json    # recomendado para logs y automatización
aureo stream --format pretty  # recomendado para uso interactivo
```

El formato `pretty` muestra el nivel y motivo del veredicto:

```text
[ALTO] Más de 3 operaciones de una dirección en 5 bloques consecutivos.
```

Si el veredicto contiene `requiere_mfa: true`, la CLI solicita un código de
forma interactiva. La CLI no valida ese código ni lo envía al backend; solo
informa que debe validarlo el proveedor de identidad. Para CI o procesos sin
terminal:

```bash
aureo stream --no-mfa-prompt --format json
```

### `report`

Envía una consulta a `POST /reports`:

```bash
aureo report "¿Qué operaciones fueron de alto riesgo?"
aureo report --format pretty "Resume las alertas críticas"
aureo report --url http://backend.example.com "Resume los últimos eventos"
```

El comando rechaza consultas vacías, usa un timeout de 15 segundos y muestra
el detalle devuelto por el backend cuando la respuesta HTTP no es exitosa.

## Automatización

Los comandos devuelven código `0` cuando terminan correctamente y `1` ante
errores de conexión, URL inválida, timeout, respuesta HTTP no exitosa o
desconexión inesperada del stream.

Ejemplo de healthcheck:

```bash
if ! aureo status --json >/tmp/aureo-status.json; then
  echo "Backend no disponible" >&2
  exit 1
fi
```

Para procesar reportes como JSON:

```bash
aureo report --format json "Resume los veredictos recientes" | jq .
```

## Docker

Con Docker Compose, ejecuta:

```bash
npm run docker:cli
```

El contenedor usa el nombre interno `backend`; no uses `127.0.0.1` para
referirte al backend desde dentro del contenedor.

## Seguridad y límites

- No se guardan claves privadas en la CLI.
- No compartas tokens MFA ni secretos en argumentos de shell, porque pueden
  quedar registrados en el historial del terminal.
- El stream no autentica clientes por sí mismo; protege el backend con TLS,
  autenticación y autorización antes de exponerlo fuera de una red confiable.
- La CLI no decide si una operación se bloquea y no ejecuta `pause()` en el
  contrato.

Para la referencia ampliada de arquitectura y backend consulta
[`../md/CLI.md`](../md/CLI.md) y [`../md/BACKEND.md`](../md/BACKEND.md).
