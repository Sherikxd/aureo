# Caso `speed`: operaciones rápidas

## Qué simula

Una wallet ejecuta cuatro transferencias consecutivas de `1_000` dentro de una
ventana de cinco bloques. El patrón puede representar automatización no
autorizada, una clave comprometida o un error de integración.

## Proceso paso a paso

1. El runner reutiliza `AureoCore` si ya existe y prepara la cuenta operadora.
2. Envía cuatro llamadas a `recordCorporateTransfer`, con referencias
   `BATCH-DEMO-A` a `BATCH-DEMO-D`.
3. Cada transacción se confirma en un bloque consecutivo del nodo Hardhat.
4. El runner comprueba que la diferencia entre el primer y el último bloque no
   supera cuatro, es decir, que caben en una ventana de cinco bloques.
5. El SDK evalúa cada transferencia y el JSON final incluye `metrics` con la
   señal `alto` y `contractBlocks: 1`.
6. No ejecuta `pause()`: la pausa sigue siendo una decisión explícita de
   compliance después de investigar el caso.

## Resultado esperado

El JSON contiene `expectedRisk: "alto"` y documenta que la recomendación de
pausa no equivale a una pausa automática.
