# Áureo: observabilidad y compliance para operaciones Ethereum

## Resumen ejecutivo

Áureo es un middleware open source para aplicaciones Ethereum que necesitan
observar operaciones corporativas, detectar señales de riesgo y conservar
evidencia auditable. Conecta un contrato de registro, un backend de análisis,
un SDK reutilizable y una CLI operativa.

El proyecto no custodia fondos ni ejecuta pagos. Registra metadatos de
operaciones y proporciona señales para que tesorería, compliance y seguridad
tomen decisiones controladas.

## El problema

En muchas aplicaciones blockchain, la operación on-chain, el monitoreo y el
proceso de compliance viven separados:

- el contrato registra una transacción, pero no existe contexto operativo;
- los equipos reciben eventos sin reglas consistentes de velocidad o volumen;
- las alertas quedan fuera de la cadena o no tienen una referencia verificable;
- una desconexión o reinicio puede ocultar eventos si no existe recuperación;
- un análisis basado en IA puede fallar sin que exista un modo seguro alternativo;
- las herramientas de investigación no siempre tienen una API, stream o CLI
  común.

Esta separación aumenta el tiempo de respuesta y dificulta reconstruir qué
ocurrió, por qué se marcó una operación y qué decisión tomó compliance.

## Qué solución propone Áureo

Áureo reúne cuatro capacidades:

1. **Registro auditable:** `AureoCore` guarda transferencias corporativas,
   referencias, iniciadores, beneficiarios, montos y alertas.
2. **Ingesta recuperable:** el backend consulta logs por RPC desde el último
   bloque persistido, recupera eventos después de reinicios y elimina
   duplicados.
3. **Evaluación de riesgo:** reglas deterministas detectan ráfagas de
   operaciones y anomalías de volumen usando aritmética exacta.
4. **Operación accesible:** SDK, métricas locales, API, WebSocket y CLI
   permiten integrar, observar y consultar el sistema desde una aplicación o
   terminal.

El LLM es una capa de enriquecimiento, no la única barrera de seguridad. Si no
hay clave, cuota o conectividad con Groq/xAI, las reglas locales siguen funcionando y
se publica un veredicto `determinista_degradado`.

## Cómo funciona

```text
Aplicación / tesorería
          |
          v
     AureoCore.sol
          |\
          v
 RPC: logs + cursor persistido
          |
          v
 Ventana de análisis de 1 minuto
          |
     +----+-----+
     |          |
 reglas      LLM opcional
 locales     timeout/reintentos
     |          |
     +----+-----+
          v
 Veredicto persistido
     |           |
     v           v
 WebSocket     CLI /reports

SDK: registro directo + snapshot de métricas locales
```

## Componentes

| Componente | Función |
| --- | --- |
| `blockchain/` | Contrato `AureoCore`, roles, alertas y Circuit Breaker. |
| `backend/` | Recuperación de logs, ventanas, políticas y análisis opcional con Groq/xAI. |
| `packages/sdk/` | Cliente unificado, signer, monitor, políticas y métricas locales. |
| `cli-client/` | Estado del backend, stream de veredictos y reportes. |
| `examples/` | Dapp de referencia y casos operativos reproducibles. |
| `scripts/` | Despliegue local, demos, entorno local y operación. |

## Casos que se pueden demostrar

### Transferencia normal

Una operación dentro de la reserva operativa se registra y queda disponible
para auditoría sin generar una alerta.

### Actividad rápida

Cuatro operaciones de la misma dirección en cinco bloques activan una señal de
riesgo alto. La pausa no se ejecuta automáticamente: compliance decide.

### Volumen elevado

Una operación que supera la reserva o el histórico activa riesgo medio y MFA.
Compliance puede registrar una alerta y pausar el contrato de forma explícita.

Ejecuta los casos localmente:

```bash
npm --workspace blockchain run node
npm run demo:case -- normal
npm run demo:case -- speed
npm run demo:case -- volume
```

Cada caso imprime un bloque `metrics` calculado por el SDK. Las métricas no
dependen del backend: `speed` muestra la señal de velocidad y la recomendación
de bloqueo; `volume` muestra el monto total, riesgo medio y MFA requerida.

## Seguridad y límites

Áureo aplica separación de roles entre operación y compliance, valida la
dirección pública de las wallets y no convierte montos blockchain a `Number`.
Sin embargo, el proyecto sigue requiriendo controles antes de producción:

- autenticación y autorización de API/WebSocket;
- almacenamiento compartido para múltiples instancias;
- gestión de secretos con Vault, KMS, HSM, Safe o MPC;
- política formal de MFA e identidad;
- exportación de métricas del SDK a Prometheus/OpenTelemetry, auditoría y
  pruebas de integración con la red objetivo;
- revisión de contratos y operación con multisig.

La pausa del contrato y cualquier bloqueo son decisiones institucionales; la
señal del analizador no sustituye aprobación humana ni controles financieros.

## Estado actual

El proyecto está preparado para desarrollo, demos locales y como base de
integración para dapps Ethereum. Sus puntos fuertes son la trazabilidad del
flujo, las reglas deterministas, la recuperación de eventos y una integración
simple mediante `createAureoClient`.

La siguiente etapa natural es convertir el estado JSON local en una
infraestructura compartida, añadir autenticación de clientes y ampliar las
pruebas de integración y observabilidad.

## Enlaces

- [README principal](../README.md)
- [Arquitectura](ARQUITECTURA.md)
- [Backend](BACKEND.md)
- [CLI](CLI.md)
- [Casos ejecutables](../examples/cases/README.md)
- [SDK](../packages/sdk/README.md)
- [Scripts](SCRIPTS.md)
