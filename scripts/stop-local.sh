#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.runtime/local-stack.pids"

if [[ ! -f "$PID_FILE" ]]; then
  printf 'No hay registro de PID; buscando únicamente procesos del stack local.\n'
  while read -r pid command; do
    [[ "$pid" =~ ^[0-9]+$ ]] || continue
    case "$command" in
      *"hardhat node --hostname 127.0.0.1"*|*"node src/index.js"*|*"node src/index.js stream"*)
        kill "$pid" 2>/dev/null || true
        printf 'Proceso detenido: %s (%s)\n' "$command" "$pid"
        ;;
    esac
  done < <(ps -eo pid=,args=)
  printf 'Entorno local cerrado. Los despliegues y estados persistidos no fueron eliminados.\n'
  exit 0
fi

stop_tree() {
  local pid="$1"
  local child
  if [[ ! "$pid" =~ ^[0-9]+$ ]] || ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi
  while read -r child; do
    [[ -n "$child" ]] && stop_tree "$child"
  done < <(pgrep -P "$pid" 2>/dev/null || true)
  kill "$pid" 2>/dev/null || true
}

while IFS='=' read -r label pid; do
  [[ -n "$label" && -n "$pid" ]] || continue
  if [[ "$label" == "blockchain" || "$label" == "backend" || "$label" == "cli" ]]; then
    stop_tree "$pid"
    printf 'Proceso detenido: %s (%s)\n' "$label" "$pid"
  fi
done < "$PID_FILE"

rm -f "$PID_FILE"
printf 'Entorno local cerrado. Los despliegues y estados persistidos no fueron eliminados.\n'
