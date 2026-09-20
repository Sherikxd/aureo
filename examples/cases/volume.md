# Caso `volume`: volumen elevado y compliance

## Qué simula

Un operador registra dos operaciones históricas normales (`10_000` y `12_000`)
y después una transferencia urgente de `350_000`. El monto supera la reserva
operativa y requiere revisión reforzada.

## Proceso paso a paso

1. El runner despliega `AureoCore` y prepara los roles de operador y compliance.
2. Registra las dos operaciones históricas para representar el comportamiento
   habitual del iniciador.
3. Registra `ACQ-DEMO-URGENT` por `350_000` mediante
   `recordCorporateTransfer`.
4. Compliance llama a `startAlert` con nivel `2` y una razón de revisión MFA.
   El contrato persiste la alerta y emite `AlertStarted`.
5. Compliance ejecuta explícitamente `pause()` como medida de contención.
6. El runner verifica `paused()`, registra `pauseCheck: "passed"` y ejecuta
   `unpause()` para dejar el nodo listo para otra demo.

## Resultado esperado

El JSON contiene `expectedRisk: "medio"`, `volumeViolation: true`, un `alertId`
y una comprobación de pausa aprobada. La demo no autentica MFA ni decide si se
libera la transferencia; esas decisiones pertenecen al proveedor de identidad
y al equipo de compliance.
