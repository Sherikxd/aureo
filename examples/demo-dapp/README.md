# Demo dapp de Áureo

Proyecto mínimo para probar `@aureo/sdk` contra el contrato `AureoCore` en una
red Hardhat local. La demo ejercita las tres piezas del SDK:

1. `createEthereumSigner` para conectar una wallet Ethereum opcional.
2. `createEthereumMonitor` para escuchar `CorporateTransferRecorded` por WebSocket.
3. `evaluateEthereumPolicy` para detectar la regla de más de tres operaciones
   dentro de cinco bloques.

La demo no usa una red pública ni mueve fondos reales.

## Inicio rápido

Desde la raíz del monorepo:

```bash
npm install
npm run setup:env
npm --workspace blockchain run node
```

El comando anterior configura también la wallet. Para usar las cuentas
prefinanciadas de Hardhat sin solicitar una clave, ejecuta:

```bash
npm run setup:env -- --skip-wallet
```

En otra terminal:

```bash
npm run demo:run
```

El script despliega `AureoCore` automáticamente, inyecta
`AUREO_CORE_ADDRESS` en la ejecución y envía cuatro operaciones. El resultado
debe mostrar `speedViolation: true`. En este flujo local, tanto el despliegue
como el demo usan la primera cuenta prefunded de Hardhat, aunque
`examples/demo-dapp/.env` contenga una wallet configurada.

## Qué procesos ejecuta la demo

La demo reproduce un flujo completo de observabilidad para operaciones
corporativas sobre Ethereum:

1. **Conecta con la red local.** Usa el nodo Hardhat mediante HTTP para enviar
   transacciones y WebSocket para observar los eventos confirmados.
2. **Despliega `AureoCore`.** El script `npm run demo:run` compila el contrato,
   reinicia el despliegue local y obtiene la dirección generada.
3. **Selecciona la identidad operativa.** Por defecto usa la primera cuenta
   prefunded de Hardhat, que recibe `DEFAULT_ADMIN_ROLE`, `OPERATOR_ROLE` y
   `COMPLIANCE_ROLE` durante la construcción del contrato.
4. **Registra transferencias corporativas.** Envía cuatro llamadas a
   `recordCorporateTransfer`, con un beneficiario, monto y referencia únicos.
5. **Persiste evidencia on-chain.** `AureoCore` asigna un identificador
   incremental, guarda el iniciador, beneficiario, monto, referencia y marca de
   tiempo, y publica `CorporateTransferRecorded`.
6. **Monitorea los eventos.** El monitor del SDK recibe cada evento por
   WebSocket y lo transforma en un registro local para el análisis.
7. **Evalúa la política.** `evaluateEthereumPolicy` revisa la velocidad y el
   volumen de las operaciones. Al detectar cuatro operaciones de la misma
   dirección en cinco bloques, activa `speedViolation`.
8. **Cierra la ejecución.** Espera todos los eventos, imprime el resumen JSON y
   cierra el monitor WebSocket y el proveedor HTTP.

La demo no ejecuta pagos reales, no mueve tokens y no llama al backend ni a
Grok. El monto representa datos de prueba y las operaciones solo persisten en
la cadena local de Hardhat.

## Qué escenario está simulando

El escenario representa a un operador que registra varias transferencias
corporativas consecutivas desde la misma wallet. Las primeras operaciones
parecen normales, pero la cuarta dentro de una ventana de cinco bloques activa
una señal de riesgo por velocidad. El sistema no bloquea automáticamente la
transacción en esta demo: genera una evidencia y un veredicto para que una capa
de compliance o un backend pueda revisar el caso y decidir si requiere MFA,
alerta o pausa del circuito.

En términos operativos, se simula:

- una dapp enviando operaciones a un contrato corporativo;
- un monitor de compliance observando eventos en tiempo real;
- una regla determinista detectando actividad anómala;
- la generación de una señal auditable para una respuesta posterior.

El flujo deliberadamente no incluye análisis con IA, autenticación MFA ni
activación del `Circuit Breaker`; esos procesos pertenecen al backend y a los
casos de uso documentados en [`md/DEVELOPMENT.md`](../../md/DEVELOPMENT.md) y
[`md/Ejemplos_Casos.md`](../../md/Ejemplos_Casos.md).

## Probar una wallet Ethereum

Por defecto la demo usa la cuenta `0` que expone Hardhat mediante
`JsonRpcProvider`. Para probar el módulo de wallet del SDK, configura en
`examples/demo-dapp/.env` la clave privada de la cuenta administradora que
imprime `hardhat node`:

```dotenv
DEMO_PRIVATE_KEY=0x...
DEMO_PUBLIC_ADDRESS=0x...
```

La cuenta debe ser la administradora del contrato desplegado y tener fondos
locales. Para usarla en el demo, desactiva la cuenta local predeterminada:

```dotenv
# blockchain/.env
AUREO_LOCAL_DEFAULT_ACCOUNT=false
```

Después configura `DEMO_PRIVATE_KEY` y `DEMO_PUBLIC_ADDRESS` en
`examples/demo-dapp/.env`. Puedes llenar estos valores automáticamente con:

```bash
npm run setup:wallet
```

La clave es solo para desarrollo local y nunca debe reutilizarse en una red
pública.

También puedes cambiar el beneficiario, el número de operaciones y el monto:

```dotenv
DEMO_BENEFICIARY=0x...
DEMO_OPERATIONS=4
DEMO_AMOUNT=10
```

## Flujo de la demo

```text
Hardhat node
    |
    +--> deploy:blockchain -> AureoCore
    |
    +--> demo dapp
           |
           +--> wallet/signer con ethers
           +--> recordCorporateTransfer(...)
           +--> WebSocket monitor
           +--> policy evaluator
```

Cada evento recibido se normaliza, se añade al lote local y se pasa a
`evaluateEthereumPolicy`. Con cuatro operaciones consecutivas de la misma
dirección, la salida muestra:

```json
{
  "speedViolation": true,
  "minimumRisk": "bajo",
  "reasons": ["Más de 3 operaciones de una dirección en 5 bloques consecutivos."]
}
```

`minimumRisk` representa el umbral mínimo de la política; el backend de
referencia convierte esta violación en riesgo `alto` y bloqueo.

## Integración en otra aplicación

Instala el paquete:

```bash
npm install @aureo/sdk ethers
```

Importa solo lo que necesites:

```js
import { createEthereumMonitor, evaluateEthereumPolicy } from '@aureo/sdk';
```

El SDK es independiente del backend, la CLI y el contrato de ejemplo.
