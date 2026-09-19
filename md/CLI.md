# CLI de Áureo

La CLI está optimizada para terminales Linux y se instala desde el workspace
`cli-client`. Requiere Node.js 20 o superior. También puede ejecutarse mediante
Docker Compose sin instalar Node.js en el host.

## Configuración

Desde la raíz del monorepo:

```bash
npm run setup:env
```

Configura las URLs del backend:

```dotenv
AUREO_BACKEND_URL=http://127.0.0.1:3000
AUREO_STREAM_URL=ws://127.0.0.1:3000/stream
```

En Docker Compose, el contenedor `cli` reemplaza automáticamente `127.0.0.1`
por el nombre interno `backend`.

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
