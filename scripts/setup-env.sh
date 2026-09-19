#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FORCE=false

if [[ "${1:-}" == "--force" ]]; then
  FORCE=true
elif [[ $# -gt 0 ]]; then
  printf 'Uso: npm run setup:env [-- --force]\n' >&2
  exit 2
fi

copy_template() {
  local template="$1"
  local target="$2"

  if [[ -e "$target" && "$FORCE" != true ]]; then
    printf 'Conservado: %s\n' "$target"
    return
  fi

  cp "$ROOT_DIR/$template" "$ROOT_DIR/$target"
  chmod 600 "$ROOT_DIR/$target"
  printf 'Creado: %s\n' "$target"
}

cd "$ROOT_DIR"
copy_template blockchain/.env.example blockchain/.env
copy_template backend/.env.example backend/.env
copy_template cli-client/.env.example cli-client/.env
copy_template examples/demo-dapp/.env.example examples/demo-dapp/.env

cat <<'EOF'

Configuración creada. Antes de iniciar:
1. Define XAI_API_KEY en backend/.env si usarás Grok.
2. Define ETH_PRIVATE_KEY y ETH_PUBLIC_ADDRESS solo si firmarás con una wallet.
3. Para la demo local puedes dejar examples/demo-dapp/.env sin cambios.
EOF
