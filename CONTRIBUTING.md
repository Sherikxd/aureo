# Guía de Contribución - Áureo

¡Gracias por tu interés en contribuir a Áureo! Este documento describe los estándares, flujos de trabajo y criterios para que tu contribución sea revisada y fusionada de forma ágil.

---

## Índice

1. [Código de Conducta](#código-de-conducta)
2. [Cómo Empezar](#cómo-empezar)
3. [Flujo de Trabajo](#flujo-de-trabajo)
4. [Estándares de Código](#estándares-de-código)
5. [Convenciones de Commits](#convenciones-de-commits)
6. [Pruebas y Validación](#pruebas-y-validación)
7. [Documentación](#documentación)
8. [Seguridad y Secretos](#seguridad-y-secretos)
9. [Criterios de Aceptación](#criterios-de-aceptación)
10. [Reportar Problemas](#reportar-problemas)

---

## Código de Conducta

Este proyecto sigue el [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). Al participar, te comprometes a mantener un entorno respetuoso, inclusivo y libre de acoso.

---

## Cómo Empezar

### Requisitos previos

- **Node.js ≥ 20** y **npm ≥ 10**
- **Docker Engine** y **Docker Compose v2** (recomendado para entorno completo)
- Git configurado con tu nombre y email

### Configuración inicial

```bash
# 1. Fork y clona tu fork
git clone https://github.com/TU_USUARIO/aureo.git
cd aureo

# 2. Instala dependencias (usa npm ci para reproducibilidad)
npm ci

# 3. Configura entorno local (crea .env con plantillas seguras)
npm run setup:env

# 4. Verifica que todo funciona
npm run lint
npm run format -- --check
```

### Levantar el entorno de desarrollo

```bash
# Opción A: Demo solo blockchain (rápido, sin backend)
npm run demo:blockchain

# Opción B: Entorno completo con Docker
npm run docker:up
# En otra terminal:
curl http://127.0.0.1:3000/health
```

Consulta [`md/GUIA_DESARROLLO_LOCAL.md`](md/GUIA_DESARROLLO_LOCAL.md) para detalles completos.

---

## Flujo de Trabajo

### 1. Elige o crea un Issue

- Busca en [Issues](https://github.com/tu-org/aureo/issues) si ya existe
- Si no existe, crea uno describiendo:
  - **Problema** o **mejora** concreta
  - **Contexto** (arquitectura afectada, scripts, documentación)
  - **Criterio de aceptación** esperable

### 2. Crea una rama

```bash
git checkout -b feat/descripcion-corta    # nueva funcionalidad
git checkout -b fix/descripcion-corta     # corrección de bug
git checkout -b docs/descripcion-corta    # solo documentación
git checkout -b refactor/descripcion-corta # refactor sin cambio funcional
git checkout -b test/descripcion-corta    # solo pruebas
```

> **Convención de ramas:** `tipo/descripción-en-kebab-case`

### 3. Desarrolla en cambios pequeños y atómicos

- Un PR = una preocupación (single concern)
- Prefiere PRs pequeños (< 300 líneas modificadas) sobre uno grande
- Cada commit debe ser autocontenido y pasar lint/tests

### 4. Ejecuta validaciones locales **antes** de pushear

```bash
# Lint + formato (lo que ejecuta el pre-commit hook)
npm run lint
npm run format -- --check

# Pruebas relevantes al área cambiada
# Blockchain:
npm --workspace blockchain run test

# Backend:
npm --workspace backend run test

# SDK:
npm --workspace packages/sdk run test

# CLI:
npm --workspace cli-client run test
```

### 5. Abre Pull Request

- Usa la plantilla de PR (se crea automáticamente)
- Referencia el issue: `Closes #123` o `Relates to #123`
- Incluye:
  - **Qué cambia** y **por qué**
  - **Cómo probarlo** (comandos, casos de prueba)
  - **Capturas/logs** si hay cambios visuales o de CLI
  - **Actualizaciones de docs** asociadas

---

## Estándares de Código

### JavaScript / TypeScript (ESM)

- **ES Modules obligatorio** (`"type": "module"` en todos los `package.json`)
- **JSDoc** para funciones públicas, clases y tipos complejos
- **No CommonJS** (`require`, `module.exports`, `__dirname`)
- **JavaScript moderno** (opcional chaining, nullish coalescing, top-level await)

### Estructura del Monorepo

```
├── blockchain/           # Contratos Solidity + Hardhat Ignition
├── backend/              # Ingesta RPC, reglas, LLM, API, WebSocket
├── packages/sdk/         # SDK reusable (@aureo/sdk)
├── cli-client/           # CLI operativa (aureo stream, aureo report)
├── examples/             # Demos y casos de uso reproducibles
├── scripts/              # Scripts de despliegue, setup, demos
├── md/                   # Documentación técnica (arquitectura, guías)
└── .copilot/             # Prompts IA + hooks git
```

### Patrones Requeridos

| Área | Reglas |
|------|--------|
| **Errores** | Validar entradas externas, lanzar errores con contexto (`Error: [Contexto] mensaje`), no tragar excepciones |
| **Secrets** | Nunca hardcodear claves, tokens, URLs sensibles; usar variables de entorno |
| **Roles/Acceso** | Smart contracts: OpenZeppelin `AccessControl` + `Pausable`; Backend: validar roles antes de acciones sensibles |
| **Async/await** | Preferir sobre `.then()`/`catch()`; manejo explícito de `try/catch` |
| **Eventos** | Contratos: emitir eventos indexados para operaciones y alertas; Backend: deduplicar por `txHash + logIndex` |

### Lint y Formato

```bash
# Lint (ESLint flat config)
npm run lint

# Formato (Prettier)
npm run format          # escribe cambios
npm run format -- --check  # solo verifica (CI)
```

El hook `pre-commit` ejecuta ambos automáticamente. Instálalo con:

```bash
ln -sf ../../.copilot/hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

---

## Convenciones de Commits

Usamos **Conventional Commits** (formato Angular):

```
<tipo>(<ámbito>): <descripción breve en minúsculas>

[cuerpo opcional con motivación y contexto]

[pie opcional: Closes #123, Relates to #456]
```

### Tipos permitidos

| Tipo | Uso |
|------|-----|
| `feat` | Nueva funcionalidad |
| `fix` | Corrección de bug |
| `docs` | Solo documentación |
| `refactor` | Cambio interno sin alterar comportamiento |
| `test` | Añadir o modificar pruebas |
| `chore` | Mantenimiento (deps, configs, scripts) |
| `perf` | Mejora de rendimiento |
| `security` | Mejora de seguridad |
| `ci` | Cambios en CI/CD |

### Ejemplos

```bash
# Correcto
feat(sdk): añade createAureoClient para registro unificado
fix(backend): corrige deduplicación de logs tras reinicio
docs(arch): actualiza diagrama de flujo con Circuit Breaker
refactor(analyzer): extrae validación de veredicto a helper
test(blockchain): añade caso pausa rechaza transferencia

# Incorrecto
Arreglo bug en backend
Update README
WIP
```

### Ámbitos habituales

`blockchain`, `backend`, `sdk`, `cli`, `examples`, `scripts`, `docs`, `ci`, `docker`, `deps`

---

## Pruebas y Validación

### Estrategia de testing

- **Unitarias**: Lógica pura (políticas, métricas, validadores, helpers)
- **Integración**: Flujos completos (contrato ↔ backend, SDK ↔ RPC)
- **E2E / Demos**: Scripts en `scripts/` y `examples/cases/`

### Ejecutar pruebas

```bash
# Todas las workspaces
npm test

# Por workspace
npm --workspace blockchain run test
npm --workspace backend run test
npm --workspace packages/sdk run test
npm --workspace cli-client run test

# Casos operativos (speed, volume, normal)
npm run demo:cases
```

### Cobertura mínima

- Código nuevo: **≥ 80%** en líneas y ramas críticas
- Cambios en reglas de riesgo: **100%** en casos borde (límites exactos, off-by-one)
- Rutas de error: probar que lanzan el error esperado con mensaje claro

---

## Documentación

### Qué documentar

| Cambio | Docs a actualizar |
|--------|-------------------|
| Nueva variable de entorno | `md/BACKEND.md`, `md/HASHKEY.md`, `backend/.env.example` |
| Nuevo comando CLI | `md/CLI.md`, `cli-client/README.md` |
| Nueva función SDK | `packages/sdk/README.md`, JSDoc en código |
| Cambio en contrato | `md/ARQUITECTURA.md`, `blockchain/contracts/AureoCore.sol` (NatSpec) |
| Nuevo script | `md/SCRIPTS.md` |
| Nueva red/despliegue | `md/HASHKEY.md`, `md/GUIA_DESARROLLO_LOCAL.md` |

### Estilo

- **Idioma:** Español (es-ES), técnico pero accesible
- **Formato:** Markdown con tablas, bloques de código anotados (`bash`, `js`, `sol`)
- **Ejecutables:** Incluir comandos copiables y salidas esperadas
- **Enlaces:** Relativos entre archivos `md/`, absolutos a GitHub para código

### Verificación

```bash
# Verifica enlaces rotos (requiere markdown-link-check)
npx markdown-link-check md/*.md

# Verifica formato de variables de entorno en ejemplos
grep -r "ETH_PRIVATE_KEY=" md/ --include="*.md" | grep -v "0x\.\.\."
```

---

## Seguridad y Secretos

### ❌ NUNCA hagas commit de

- Claves privadas (`0x...`, `PRIVATE_KEY=`, `SEED=`, `MNEMONIC=`)
- API Keys (`OPENAI_API_KEY`, `GROQ_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY`)
- URLs con credenciales (`https://user:pass@...`, `mongodb://...`)
- Archivos `.env`, `.env.local`, `*.pem`, `*.key`, `keystore/`

### ✅ Buenas prácticas

- Usa `.env.example` con valores placeholder (`TU_CLAVE_AQUI`)
- `npm run setup:env` genera plantillas con permisos `600`
- En CI/CD: usa GitHub Secrets, Vault, KMS, HSM, Safe o MPC
- La wallet del backend (`ETH_PRIVATE_KEY`) es distinta de la de despliegue (`DEPLOYER_PRIVATE_KEY`)

### Auditoría de secretos

```bash
# Verifica que no hay secretos en staged
git diff --cached --name-only | xargs grep -l "PRIVATE_KEY\|API_KEY\|SECRET" 2>/dev/null && echo "⚠️ POSIBLES SECRETOS DETECTADOS" || echo "OK"
```

---

## Criterios de Aceptación

Un PR se aprueba y fusiona cuando cumple **todos**:

| Criterio | Descripción |
|----------|-------------|
| **Funcionalidad** | Resuelve el issue sin romperFeatures no relacionadas |
| **Seguridad** | Respeta roles, validaciones, manejo de errores y secretos |
| **Pruebas** | Cubre comportamiento nuevo/actualizado (unitarias + integración si aplica) |
| **Documentación** | Explica configuración, límites, comandos y variables afectadas |
| **Calidad** | Pasa `lint`, `format --check`, y `test` en CI |
| **Tamaño** | Diff pequeño, legible, revisable en una sola sesión (< 300 líneas ideal) |
| **Commits** | Historial limpio, convencional, sin fixup/squash innecesarios |

### Checklist para el autor (incluye en tu PR)

```markdown
- [ ] `npm run lint` pasa
- [ ] `npm run format -- --check` pasa
- [ ] Pruebas relevantes pasan (`npm test` o workspace específico)
- [ ] Documentación actualizada (README, md/, JSDoc, .env.example)
- [ ] No hay secretos en el diff
- [ ] Commits siguen Conventional Commits
- [ ] PR referencia issue (`Closes #X` / `Relates to #X`)
- [ ] Descripción clara de qué cambia, por qué y cómo probar
```

---

## Reportar Problemas

### Bug Report

Incluye:

1. **Versión/entorno**: `node -v`, `npm -v`, SO, Docker version
2. **Pasos para reproducir** (mínimos, determinísticos)
3. **Comportamiento esperado** vs **observado**
4. **Logs/errores** relevantes (sin secretos)
5. **Workaround** conocido (si existe)

### Feature Request

1. **Problema real** que resuelve (no "sería guay tener X")
2. **Casos de uso** concretos
3. **Alternativas consideradas**
4. **Impacto** en arquitectura, seguridad, compatibilidad

### Vulnerabilidad de Seguridad

**NO abras issue público.** Envía detalles a `security@tudominio.com` o usa [GitHub Security Advisories](https://github.com/tu-org/aureo/security/advisories/new). Incluye:

- Descripción de la vulnerabilidad
- Vector de ataque y impacto
- PoC (si es seguro compartirlo)
- Versiones afectadas

---

## Recursos Útiles

- **Arquitectura:** [`md/ARQUITECTURA.md`](md/ARQUITECTURA.md)
- **Desarrollo local:** [`md/GUIA_DESARROLLO_LOCAL.md`](md/GUIA_DESARROLLO_LOCAL.md)
- **Scripts disponibles:** [`md/SCRIPTS.md`](md/SCRIPTS.md)
- **CLI reference:** [`md/CLI.md`](md/CLI.md)
- **Backend internals:** [`md/BACKEND.md`](md/BACKEND.md)
- **SDK usage:** [`packages/sdk/README.md`](packages/sdk/README.md)
- **Prompts para IA:** [`md/prompts/README.md`](md/prompts/README.md)
- **Casos de prueba:** [`examples/cases/README.md`](examples/cases/README.md)

---

## ¿Preguntas?

- Abre un [Discussion](https://github.com/tu-org/aureo/discussions) para dudas de diseño o arquitectura
- Revisa issues existentes antes de crear uno nuevo
- Para dudas rápidas: revisa los prompts en `md/prompts/` — están pensados para guiar tanto a humanos como a asistentes de IA

---

> **Nota:** Esta guía es un documento vivo. Si encuentras algo que debería mejorar, ¡abre un PR sobre `CONTRIBUTING.md`!