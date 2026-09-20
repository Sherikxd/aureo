# CLI de Áureo

La CLI está optimizada para terminales Linux y se instala desde el workspace
`cli-client`. Requiere Node.js 20 o superior. También puede ejecutarse mediante
Docker Compose sin instalar Node.js en el host.

La guía rápida junto al código está en
[`cli-client/README.md`](../cli-client/README.md). Este documento contiene la
referencia operativa y los detalles de integración con el backend.

## Configuración

Desde la raíz del monorepo:

```bash
npm run setup:env
```

Este comando también solicita la wallet Ethereum. Si la CLI solo consumirá
streams y reportes, usa `npm run setup:env -- --skip-wallet`.

Configura las URLs del backend:

```dotenv
AUREO_BACKEND_URL=http://127.0.0.1:3000
AUREO_STREAM_URL=ws://127.0.0.1:3000/stream
```

En Docker Compose, el contenedor `cli` reemplaza automáticamente `127.0.0.1`
por el nombre interno `backend`.

La CLI no necesita `ETH_PRIVATE_KEY`, `ETH_PUBLIC_ADDRESS` ni ninguna otra
clave para consultar el backend. Esas variables pertenecen al backend o a
otras herramientas del monorepo.

Instala dependencias y verifica la ayuda:

```bash
npm ci
npm run cli -- --help
```

También puedes instalar el binario globalmente desde el workspace:

```bash
npm --workspace cli-client link
aureo --help
```

## Estado del backend

Comprueba conectividad, salud y wallet operativa:

```bash
aureo status
aureo status --url http://127.0.0.1:3000 --json
```

El comando devuelve código `1` si alguno de los endpoints no responde
correctamente.

## Streaming de veredictos

```bash
npm run cli -- stream
# o, si instalaste el binario:
aureo stream
```

El comando abre un WebSocket y muestra cada veredicto recibido. Finaliza con
`Ctrl+C`; la conexión se cierra limpiamente. Puedes sobrescribir la URL:

```bash
aureo stream --url ws://backend.example.com/stream
```

Para una salida legible en terminal, en lugar de JSON:

```bash
aureo stream --format pretty
```

En automatizaciones evita el prompt MFA:

```bash
aureo stream --no-mfa-prompt --format json
```

La CLI valida la URL antes de conectarse, ignora mensajes WebSocket que no sean
JSON válido y devuelve código `1` si el stream se cierra inesperadamente.
Mientras exista una solicitud MFA pendiente, los veredictos posteriores no
abren prompts adicionales.

Cuando un veredicto contiene `requiere_mfa: true`, la CLI solicita un código MFA.
La CLI no valida credenciales ni considera autenticado el texto recibido: la
validación debe hacerla el proveedor de identidad integrado por el backend.

## Reportes de auditoría

```bash
npm run cli -- report "¿Qué operaciones de alto riesgo ocurrieron hoy?"
```

La consulta se envía como `POST /reports`:

```json
{ "query": "¿Qué operaciones de alto riesgo ocurrieron hoy?" }
```

La respuesta se imprime con formato JSON. Para otro backend:

```bash
aureo report --url http://127.0.0.1:3000 "Resume las alertas críticas"
```

Para una salida resumida:

```bash
aureo report --format pretty "Resume las alertas críticas"
```

`report` rechaza consultas vacías, aplica un timeout de 15 segundos y muestra el
cuerpo de error HTTP cuando el backend lo devuelve. La consulta se imprime como
JSON y nunca incluye claves privadas.

Para ejecutar el escenario blockchain reproducible y generar una transferencia
de prueba, una alerta y una comprobación de pausa:

```bash
npm run demo:blockchain
```

Consulta [`DEVELOPMENT.md`](DEVELOPMENT.md) para iniciar Hardhat, desplegar el
contrato y exportar `AUREO_CORE_ADDRESS`.

## Códigos de salida y diagnóstico

- `0`: comando iniciado o consulta completada.
- `1`: URL ausente, error de conexión, respuesta HTTP no exitosa o error de
  autenticación/stream.
- Si `stream` no conecta, comprueba `AUREO_STREAM_URL`, que el backend esté
  ejecutándose y que el proxy permita WebSocket.
- Si `report` devuelve `404`, el servicio desplegado todavía no expone `/reports`;
  debe habilitarse ese endpoint en el backend antes de usar este comando.

## Referencia rápida

| Necesidad | Comando |
| --- | --- |
| Ver ayuda | `aureo --help` |
| Comprobar backend | `aureo status` |
| Estado para automatización | `aureo status --json` |
| Stream legible | `aureo stream --format pretty` |
| Stream sin interacción | `aureo stream --no-mfa-prompt --format json` |
| Reporte legible | `aureo report --format pretty "..."` |
