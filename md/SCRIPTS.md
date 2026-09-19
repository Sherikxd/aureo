# Scripts operativos

Todos se ejecutan desde la raíz del repositorio.

| Comando                        | Función                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `npm run setup:env`            | Crea los `.env` desde las plantillas sin sobrescribir archivos existentes.     |
| `npm run setup:env -- --force` | Regenera las plantillas; reemplaza valores locales.                            |
| `npm run deploy:blockchain`    | Compila y despliega `AureoCore` con Ignition.                                  |
| `npm run deploy:backend`       | Valida `backend/.env`, instala dependencias, ejecuta lint e inicia el backend. |
| `npm run deploy:systemd`       | Instala el servicio `aureo-backend` en Linux con systemd.                      |
| `npm run demo:run`             | Despliega el contrato y ejecuta la dapp de prueba del SDK.                     |
| `npm run demo:blockchain`      | Ejecuta el demo de persistencia, alertas y pausa del contrato.                 |
| `npm run docker:up`            | Construye y levanta nodo, despliegue y backend.                                |
| `npm run docker:down`          | Detiene los servicios Docker.                                                  |
| `npm run docker:logs`          | Muestra logs del backend.                                                      |
| `npm run docker:cli`           | Ejecuta la CLI dentro de Docker.                                               |

## Configuración inicial

```bash
npm install
npm run setup:env
```

El script es idempotente: conserva `.env` existentes. Usa `--force` solo para
volver a copiar plantillas y perder los valores locales.

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

Completa `backend/.env` y ejecuta:

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
secretos. Las claves reales deben inyectarse con un gestor de secretos; nunca
uses `--force` sobre un entorno que contenga valores que quieras conservar.
