# Scripts operativos

Todos se ejecutan desde la raíz del repositorio.

| Comando                              | Función                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| `npm run setup:env`                  | Crea los `.env` y ejecuta la configuración interactiva de wallet.                  |
| `npm run setup:env -- --skip-wallet` | Crea los `.env` sin solicitar una wallet.                                          |
| `npm run setup:env -- --force`       | Regenera las plantillas; reemplaza valores locales.                                |
| `npm run setup:wallet`               | Solicita y valida una wallet Ethereum; actualiza solo sus variables en los `.env`. |
| `npm run clean`                      | Limpia artefactos y secretos locales después de confirmación.                      |
| `npm run clean:force`                | Ejecuta la limpieza sin pregunta interactiva.                                      |
| `npm run deploy:blockchain`          | Compila y despliega `AureoCore` con Ignition.                                      |
| `npm run deploy:backend`             | Valida `backend/.env`, instala dependencias, ejecuta lint e inicia el backend.     |
| `npm run deploy:systemd`             | Instala el servicio `aureo-backend` en Linux con systemd.                          |
| `npm run demo:run`                   | Despliega el contrato y ejecuta la dapp de prueba del SDK.                         |
| `npm run demo:blockchain`            | Ejecuta el demo de persistencia, alertas y pausa del contrato.                     |
| `npm run docker:up`                  | Construye y levanta nodo, despliegue y backend.                                    |
| `npm run docker:down`                | Detiene los servicios Docker.                                                      |
| `npm run docker:logs`                | Muestra logs del backend.                                                          |
| `npm run docker:cli`                 | Ejecuta la CLI dentro de Docker.                                                   |

## Configuración inicial

```bash
npm install
npm run setup:env
```

El script conserva `.env` existentes y siempre ejecuta la configuración
interactiva de wallet, salvo con `--skip-wallet`. Usa `--force` solo para volver
a copiar plantillas; no lo uses si quieres conservar sus valores.

Orden recomendado para un entorno nuevo:

```bash
npm install
npm run setup:env          # crea .env y configura la wallet
```

`setup:env` ejecuta `setup-wallet` automáticamente. Para un entorno que solo
necesita lectura o una ejecución no interactiva:

```bash
npm run setup:env -- --skip-wallet
```

La opción `--force` regenera las plantillas; después solicita y valida la
wallet, salvo que también se use `--skip-wallet`.

## Configurar la wallet

```bash
npm run setup:wallet
```

Solicita la clave privada sin eco, pide confirmación, solicita la dirección
pública y verifica que ambas correspondan usando `ethers`. Después actualiza:

```text
backend/.env                 ETH_PRIVATE_KEY / ETH_PUBLIC_ADDRESS
blockchain/.env              DEPLOYER_PRIVATE_KEY / DEPLOYER_PUBLIC_ADDRESS
examples/demo-dapp/.env      DEMO_PRIVATE_KEY / DEMO_PUBLIC_ADDRESS
```

Los archivos se dejan con permisos `600`. La clave nunca se imprime, pero el
script sí la escribe en esos `.env`; usa un gestor de secretos para entornos no
locales.

## Limpiar el proyecto

```bash
npm run clean
```

El comando elimina `node_modules`, `.env` locales, caches, artifacts, coverage,
dist, `.runtime` y despliegues locales de Ignition. Conserva el código,
`package-lock.json` y todos los `.env.example`. Para automatización:

```bash
npm run clean:force
```

Después de limpiar:

```bash
npm install
npm run setup:env
```

Para omitir la wallet:

```bash
npm run setup:env -- --skip-wallet
```

## Flujo recomendado

### Demo del SDK

```bash
npm run setup:env
npm --workspace blockchain run node
```

En otra terminal:

```bash
npm run demo:run
```

### Entorno Docker

Ejecuta la configuración y completa `backend/.env` con `XAI_API_KEY`:

```bash
npm run setup:env
npm run docker:up
```

### Despliegue manual

```bash
npm run setup:env
npm --workspace blockchain run node
npm run deploy:blockchain
npm run deploy:backend
```

## Seguridad

`setup-env.sh` crea archivos con permisos `600`, pero no genera ni recupera
secretos. `setup-wallet.sh` escribe la clave introducida en los `.env` locales;
no la registra en pantalla. Para producción usa un gestor de secretos. Nunca
uses `--force` sobre un entorno que contenga valores que quieras conservar.
