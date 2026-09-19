#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FORCE=false
SKIP_WALLET=false

for argument in "$@"; do
  case "$argument" in
    --force) FORCE=true ;;
    --skip-wallet) SKIP_WALLET=true ;;
    *)
      printf 'Uso: npm run setup:env [-- --force] [-- --skip-wallet]\n' >&2
      exit 2
      ;;
  esac
done

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

if [[ "$SKIP_WALLET" == false ]]; then
  bash "$ROOT_DIR/scripts/setup-wallet.sh"
fi

cat <<'EOF'

Configuración creada. Antes de iniciar:
1. Define XAI_API_KEY en backend/.env si usarás Grok.
2. Para la demo local puedes dejar examples/demo-dapp/.env sin cambios.
EOF
