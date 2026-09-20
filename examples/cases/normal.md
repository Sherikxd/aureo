# Caso `normal`: transferencia corporativa habitual

## Qué simula

Una persona operadora de tesorería registra una transferencia a un proveedor
aprobado. El monto es `25_000` y representa una operación dentro de una reserva
operativa de `100_000`.

## Proceso paso a paso

1. El runner despliega `AureoCore` y obtiene las cuentas locales de Hardhat.
2. La cuenta administradora conserva `OPERATOR_ROLE` y
   `COMPLIANCE_ROLE`.
3. El operador llama a `recordCorporateTransfer` con el beneficiario de la
   cuenta 1, el monto y la referencia `PAYROLL-DEMO`.
4. El contrato asigna `operationId`, persiste la transferencia y emite
   `CorporateTransferRecorded`.
5. El runner espera la confirmación, extrae el bloque y muestra la referencia
   persistida.
6. No crea una alerta ni pausa el contrato porque el escenario no contiene una
   señal de riesgo.

## Resultado esperado

El JSON contiene `expectedRisk: "bajo"`, `operationId: "1"` y la acción de
compliance indica que no se creó alerta.
