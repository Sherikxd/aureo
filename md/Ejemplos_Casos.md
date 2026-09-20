# Ejemplos de casos de uso

Este documento muestra tres escenarios operativos para Áureo. Los ejemplos
suponen que `AureoCore` está desplegado, el backend está conectado al nodo
WebSocket y existe una wallet con los roles necesarios.

> Áureo registra y analiza operaciones; no mueve fondos. Un veredicto con
> `bloquear_contrato: true` es una recomendación auditable. La decisión final
> y cualquier pausa del contrato corresponden al equipo de compliance.

## Ejecutar los casos localmente

Los tres casos están almacenados y documentados en
[`examples/cases/`](../examples/cases/). Tienen un runner reproducible sobre un nodo Hardhat. No usan
fondos reales, redes públicas, Grok ni el backend: ejecutan las transacciones
reales contra el contrato local, validan sus eventos y muestran la evidencia en
JSON.

En una terminal inicia el nodo:

```bash
npm --workspace blockchain run node
```

En otra terminal ejecuta uno de estos casos:

```bash
npm run demo:case -- normal
npm run demo:case -- speed
npm run demo:case -- volume
```

El runner despliega `AureoCore` con la primera cuenta prefunded de Hardhat,
asigna los roles necesarios para el demo, ejecuta el caso y limpia el estado de
pausa al finalizar. Para un despliegue con una wallet propia usa el flujo
manual de `deploy:blockchain` y proporciona `AUREO_CORE_ADDRESS`; la cuenta
debe tener fondos y los roles correspondientes.

La explicación proceso por proceso de cada simulación está en
[`examples/cases/README.md`](../examples/cases/README.md).

## Caso 1: Transferencia corporativa normal

**Situación:** tesorería registra una transferencia habitual a un proveedor
aprobado. El monto está dentro de la reserva operativa y no hay actividad
inusual del iniciador.

### Paso a paso

1. Configura el backend con el contrato y la wallet operativa:

   ```dotenv
   AUREO_CORE_ADDRESS=0x...
   ETH_PRIVATE_KEY=0x...
   ETH_PUBLIC_ADDRESS=0x...
   BLOCKCHAIN_WS_URL=ws://127.0.0.1:8545
   XAI_API_KEY=...
   OPERATIONAL_RESERVE=100000
   ```

2. Inicia el backend:

   ```bash
   npm run backend:start
   ```

3. Un operador con `OPERATOR_ROLE` registra la operación. Por ejemplo, una
   integración de tesorería puede firmar la transacción con ethers:

   ```js
   const reference = ethers.id('PAYROLL-2026-09-001');
   await core.recordCorporateTransfer('0xBeneficiarioAprobado', 25000, reference);
   ```

4. `AureoCore` emite `CorporateTransferRecorded`. El backend recupera el log
   por RPC, lo deduplica y lo conserva en la ventana de análisis.

5. Al cerrar la ventana de un minuto, las reglas deterministas revisan el
   volumen y el historial del iniciador. Como el monto no supera la reserva ni
   triplica el promedio, no se activa MFA.

6. El backend analiza la ventana y publica el resultado:

   ```bash
   curl -N ws://127.0.0.1:3000/stream
   ```

### Resultado esperado

Se recibe un mensaje `risk_verdict` con `nivel_riesgo` normalmente `bajo`,
`requiere_mfa: false` y `bloquear_contrato: false`. La operación queda
consultable en cadena mediante `getCorporateTransfer(operationId)`.

Demo ejecutable equivalente:

```bash
npm run demo:case -- normal
```

## Caso 2: Detección de operaciones rápidas de una misma dirección

**Situación:** una wallet ejecuta cuatro transferencias en un rango de cinco
bloques. Este patrón puede indicar automatización no autorizada, una clave
comprometida o un error de integración.

### Paso a paso

1. El equipo de monitoreo abre el stream antes de reproducir o detectar el
   patrón:

   ```bash
   npm run cli -- stream
   ```

2. El operador registra cuatro transferencias desde la misma cuenta en bloques
   consecutivos. Cada transacción usa una referencia distinta:

   ```js
   for (const suffix of ['A', 'B', 'C', 'D']) {
     await core.recordCorporateTransfer(
       '0xBeneficiario',
       1000,
       ethers.id(`BATCH-2026-09-${suffix}`),
     );
   }
   ```

3. El backend agrupa los eventos. La regla de velocidad cuenta cuatro
   operaciones de la misma dirección cuando el rango entre el primer y el
   cuarto bloque es como máximo cuatro bloques, equivalente a cinco bloques
   consecutivos.

4. La regla determinista no espera la respuesta de Grok: eleva el nivel a
   `alto`, marca `bloquear_contrato: true` y publica el motivo en el stream.

5. Compliance verifica el contexto fuera de la cadena: wallet, beneficiarios,
   referencias, órdenes internas y logs de la integración. Puede consultar la
   operación concreta con:

   ```js
   await core.getCorporateTransfer(operationId);
   ```

6. Si la investigación requiere detener nuevas operaciones, una cuenta con
   `COMPLIANCE_ROLE` ejecuta explícitamente:

   ```js
   await core.pause();
   ```

### Resultado esperado

El stream muestra una recomendación de alto riesgo. El contrato solo se pausa
si compliance confirma la medida y envía la transacción `pause()`. El backend
no pausa automáticamente el contrato.

Demo ejecutable equivalente:

```bash
npm run demo:case -- speed
```

## Caso 3: Transferencia de volumen elevado y alerta de compliance

**Situación:** una transferencia supera la reserva operativa o es mayor a tres
veces el promedio histórico del iniciador. La operación requiere una
verificación reforzada antes de continuar.

### Paso a paso

1. Define la reserva operativa del área financiera:

   ```dotenv
   OPERATIONAL_RESERVE=100000
   ```

2. Registra varias operaciones históricas normales del iniciador. El backend
   mantiene las últimas cantidades observadas por dirección para comparar
   futuras ventanas.

3. El operador registra una operación de `350000` unidades:

   ```js
   const reference = ethers.id('ACQ-2026-09-URGENT');
   await core.recordCorporateTransfer('0xProveedorAdquisicion', 350000, reference);
   ```

4. En la siguiente ventana, la regla de volumen comprueba que el monto supera
   `OPERATIONAL_RESERVE`. El veredicto mínimo se eleva a `medio` y se marca
   `requiere_mfa: true`.

5. El cliente recibe el veredicto:

   ```bash
   npm run cli -- stream
   ```

   La CLI puede solicitar un código MFA, pero la autenticación real debe
   validarse contra el proveedor de identidad corporativo; recibir texto no
   demuestra que la operación esté autenticada.

6. Compliance valida el segundo factor, el beneficiario y la orden de compra.
   Si necesita registrar una alerta en cadena, una cuenta con
   `COMPLIANCE_ROLE` ejecuta:

   ```js
   await core.startAlert(
     reference,
     2,
     'Monto superior a la reserva operativa; requiere MFA y revisión de compliance',
   );
   ```

7. El equipo documenta la decisión y libera o rechaza la operación según su
   política. Si existe evidencia de compromiso, puede ejecutar `pause()` como
   medida de circuito de emergencia.

### Resultado esperado

El stream publica un veredicto de riesgo mínimo `medio` con MFA requerido.
`AlertStarted` deja un registro inmutable de la revisión cuando compliance
confirma la alerta. La recomendación del backend no sustituye la aprobación
humana ni la política de identidad.

Demo ejecutable equivalente:

```bash
npm run demo:case -- volume
```

## Comprobaciones comunes

Después de cualquiera de los casos:

```bash
curl http://127.0.0.1:3000/health
curl -X POST http://127.0.0.1:3000/reports \
  -H 'content-type: application/json' \
  -d '{"query":"Resume los veredictos recientes"}'
```

Para un entorno local completo, consulta [`BACKEND.md`](BACKEND.md) y para la
descripción de cada tecnología consulta [`TECNOLOGIAS.md`](TECNOLOGIAS.md).
