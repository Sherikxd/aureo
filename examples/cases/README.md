# Casos operativos ejecutables

Esta carpeta contiene los escenarios que se pueden reproducir con
`npm run demo:case`. Cada caso ejecuta transacciones reales contra un contrato
`AureoCore` desplegado en Hardhat local y devuelve evidencia en JSON.

## Ejecutar cualquier caso

Inicia el nodo en una terminal:

```bash
npm --workspace blockchain run node
```

En otra terminal selecciona el caso:

```bash
npm run demo:case -- normal
npm run demo:case -- speed
npm run demo:case -- volume
```

El runner reutiliza el contrato desplegado en Hardhat, usa la primera cuenta
prefunded, asigna `OPERATOR_ROLE` y `COMPLIANCE_ROLE`, ejecuta el escenario y
muestra sus transacciones, bloques, referencias, acciones de compliance y
métricas calculadas directamente por `@aureo/sdk`.

Estos casos son simulaciones locales: no mueven fondos reales, no llaman a
Groq/xAI, no usan el backend y no conectan con una red pública. Las transacciones sí
son reales dentro de la blockchain local y ejercitan las validaciones,
eventos, roles y estado de `AureoCore`.
Las métricas del SDK incluyen operaciones, monto total, riesgo, MFA y
recomendaciones de bloqueo; no dependen del backend ni del WebSocket.

## Casos disponibles

| Caso | Simula | Evidencia principal | Documentación |
| --- | --- | --- | --- |
| `normal` | Transferencia habitual de tesorería | Transferencia persistida, sin alerta | [normal.md](normal.md) |
| `speed` | Cuatro transferencias en cinco bloques | Detección de velocidad y recomendación de riesgo alto | [speed.md](speed.md) |
| `volume` | Transferencia elevada con revisión | Alerta `AlertStarted` y pausa explícita | [volume.md](volume.md) |

La evaluación `bajo`, `medio` o `alto` describe el resultado esperado del
proceso de compliance. El runner de blockchain valida la evidencia on-chain;
los veredictos del backend y el análisis de IA se prueban en el flujo completo
documentado en [`md/Ejemplos_Casos.md`](../../md/Ejemplos_Casos.md).
