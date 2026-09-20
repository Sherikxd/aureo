#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "${1:-}" != "--yes" ]]; then
  cat <<'EOF'
Este comando eliminará artefactos locales de desarrollo:
  - node_modules/
  - archivos .env locales (con secretos)
  - caches, artifacts, coverage, dist, logs y estados .runtime
  - despliegues locales de Hardhat Ignition

No elimina código fuente, package-lock.json ni archivos .env.example.
EOF
  read -r -p "¿Continuar? [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]] || { printf 'Cancelado.\n'; exit 0; }
fi

remove_path() {
  local path="$1"
  if [[ -e "$ROOT_DIR/$path" || -L "$ROOT_DIR/$path" ]]; then
    rm -rf -- "$ROOT_DIR/$path"
    printf 'Eliminado: %s\n' "$path"
  fi
}

remove_path node_modules
remove_path .runtime
remove_path backend/.runtime
remove_path examples/realtime-metrics/.runtime
remove_path coverage
remove_path dist
remove_path .eslintcache
remove_path blockchain/artifacts
remove_path blockchain/cache
remove_path blockchain/ignition/deployments

while IFS= read -r -d '' generated_file; do
  rm -f -- "$generated_file"
  printf 'Eliminado: %s\n' "${generated_file#"$ROOT_DIR"/}"
done < <(find "$ROOT_DIR" \
  -path "$ROOT_DIR/.git" -prune -o \
  -path "$ROOT_DIR/node_modules" -prune -o \
  -type f \( -name 'npm-debug.log*' -o -name 'yarn-debug.log*' -o -name 'yarn-error.log*' \) \
  -print0)

while IFS= read -r -d '' env_file; do
  case "$env_file" in
    *.env.example) ;;
    *) rm -f -- "$env_file"; printf 'Eliminado: %s\n' "${env_file#"$ROOT_DIR"/}" ;;
  esac
done < <(find "$ROOT_DIR" \
  -path "$ROOT_DIR/.git" -prune -o \
  -path "$ROOT_DIR/node_modules" -prune -o \
  -type f -name '.env' -print0)

printf 'Limpieza completada. Ejecuta npm install y npm run setup:env para reconstruir el entorno.\n'
