# Guía de desarrollo local

Esta guía explica cómo instalar Áureo, ejecutar los ejemplos y levantar un
despliegue local completo. Todo el flujo usa Hardhat y cuentas prefunded; no
conecta con una red pública ni requiere fondos reales.

## 1. Requisitos

- Node.js 20 o superior.
- npm 10 o superior.
- Puertos `8545` y `3000` disponibles.
- Git, si clonas el repositorio.

Instala las dependencias desde la raíz:

```bash
npm ci
```

Comprueba la instalación:

```bash
npm run lint
npm run blockchain:compile
npm run blockchain:test
```

## 2. Configurar el entorno

Genera los archivos de configuración sin solicitar una wallet:

```bash
npm run setup:env -- --skip-wallet
```

Para análisis con LLM, configura en `backend/.env` un proveedor compatible.
OpenRouter es el proveedor recomendado para desarrollo:

```dotenv
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=tu-clave-local
OPENROUTER_MODEL=openai/gpt-oss-20b
```

También puedes usar `groq`, `xai` o `none`. Sin credenciales, el backend
continúa con reglas deterministas y marca los veredictos como
`determinista_degradado`.

No guardes claves privadas ni API keys en Git. Los archivos `.env` locales
están excluidos del repositorio; conserva únicamente los `.env.example`.

## 3. Ejecutar un ejemplo blockchain

Este flujo prueba contrato, roles, eventos, alertas y pausa sin backend.

En una terminal inicia Hardhat:

```bash
npm --workspace blockchain run node
```

En otra terminal ejecuta:

```bash
npm run demo:blockchain
```

La salida debe incluir `operationId`, `alertId`, el nivel de riesgo y
`pauseCheck: "passed"`.

## 4. Ejecutar los casos operativos

Con el nodo Hardhat activo, ejecuta uno de los escenarios:

```bash
npm run demo:case -- normal
npm run demo:case -- speed
npm run demo:case -- volume
```

Los casos:

| Caso | Resultado esperado |
| --- | --- |
| `normal` | Transferencia habitual sin alerta de riesgo elevada |
| `speed` | Detección de varias operaciones en pocos bloques |
| `volume` | Alerta por volumen y pausa explícita en el escenario |

Cada caso devuelve JSON y calcula métricas directamente con `@aureo/sdk`.
Estos ejemplos no usan el backend, el WebSocket ni un proveedor LLM.

La documentación detallada está en
[`examples/cases/README.md`](../examples/cases/README.md).

## 5. Levantar el despliegue local completo

El comando recomendado inicia el nodo, despliega `AureoCore`, arranca el
backend y conecta la CLI:

```bash
npm run start:local -- --with-cli
```

El flujo usa automáticamente la primera cuenta prefunded de Hardhat y genera
una dirección nueva del contrato para esa ejecución. No ejecutes
`npm run deploy:blockchain` en otra terminal mientras este proceso esté activo:
el backend debe seguir observando la dirección que acaba de desplegar.
Cada ejecución crea una cadena Hardhat en memoria; por eso `start:local`
reinicia `backend/.runtime/backend-state.json` antes de iniciar el backend y
evita reutilizar cursores o veredictos de una cadena anterior.

Comprueba los servicios desde otra terminal:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/metrics
curl http://127.0.0.1:3000/wallet
```

La CLI queda conectada al stream:

```text
ws://127.0.0.1:3000/stream
```

El stream no reenvía históricos por defecto. Usa `npm run cli -- stream
--history` solo si necesitas inspeccionar veredictos persistidos. Así, un
veredicto antiguo de Groq, xAI u otro proveedor no aparece como una respuesta
nueva de OpenRouter.

Para cerrar todo el entorno sin borrar despliegues ni estado:

```bash
npm run stop:local
```

También puedes pulsar `Ctrl+C` en la terminal de `start:local`.

## 6. Probar el stream y las métricas en tiempo real

Con `start:local` ejecutándose, abre otra terminal:

```bash
npm run metrics:realtime
```

Después ejecuta un caso que genere actividad:

```bash
npm run demo:case -- speed
```

El runner consulta `/health` y reutiliza la dirección de `AureoCore` que el
backend está observando. Esto es importante: no ejecutes el caso contra un
despliegue distinto, porque sus eventos no aparecerán en el stream.

El panel recibe los veredictos desde `/stream` y actualiza los contadores de
riesgo, MFA y recomendaciones de bloqueo. Para salida automatizable:

```bash
METRICS_OUTPUT=json npm run metrics:realtime
```

El backend analiza ventanas; con el valor predeterminado de
`BACKEND_WINDOW_MS=60000`, un veredicto puede tardar hasta un minuto. Para
pruebas rápidas puedes usar temporalmente:

```dotenv
BACKEND_WINDOW_MS=5000
```

## 7. Ejecutar una integración del SDK

Los casos locales ya usan `createAureoClient`. Para consultar la API del SDK:

```bash
npm run sdk:lint
npm run sdk:pack
```

La integración read-only de HSKChain está documentada por separado en
[`examples/hashkey-integration/README.md`](../examples/hashkey-integration/README.md).
Los casos `demo:case` no envían transacciones a HSKChain: son exclusivamente
locales.

## 8. Flujo con Docker

Si prefieres ejecutar el stack mediante Compose:

```bash
npm run setup:env -- --skip-wallet
npm run docker:up
```

Consulta el backend:

```bash
curl http://127.0.0.1:3000/health
npm run docker:logs
```

Detén los servicios:

```bash
npm run docker:down
```

## 9. Solución de problemas

### El puerto 8545 ya está ocupado

Detén el entorno local anterior:

```bash
npm run stop:local
```

Si se inició con Docker:

```bash
npm run docker:down
```

### Aparece una dirección o un veredicto antiguo

El backend conserva eventos y veredictos en:

```text
backend/.runtime/backend-state.json
```

Detén primero el entorno y elimina únicamente ese archivo si quieres comenzar
sin históricos:

```bash
npm run stop:local
rm -f backend/.runtime/backend-state.json
```

### El veredicto indica `determinista_degradado`

Comprueba que `backend/.env` tenga una clave válida y que el proveedor
corresponda con ella:

```dotenv
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=tu-clave-local
```

Si no quieres usar un proveedor externo, configura:

```dotenv
LLM_PROVIDER=none
```

### El panel no recibe veredictos

Confirma que el backend y el contrato pertenecen a la misma ejecución:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/metrics
```

No vuelvas a desplegar el contrato mientras el backend esté procesando la
ejecución actual.

## 10. Limpiar artefactos locales

La limpieza elimina dependencias, estados, artefactos de Hardhat, despliegues
locales y archivos `.env`, pero conserva el código y los `.env.example`:

```bash
npm run clean
```

Usa la variante no interactiva solo cuando estés seguro:

```bash
npm run clean:force
```
