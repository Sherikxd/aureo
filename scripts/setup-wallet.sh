#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

command -v node >/dev/null || { printf 'Node.js es obligatorio.\n' >&2; exit 1; }
[[ -d node_modules/ethers ]] || {
  printf 'Falta ethers. Ejecuta npm install antes de configurar la wallet.\n' >&2
  exit 1
}

printf 'La clave privada no se mostrará ni se guardará en el historial del shell.\n'
read -r -s -p "Clave privada Ethereum (0x...): " private_key
printf '\n'
read -r -s -p "Repite la clave privada: " private_key_confirmation
printf '\n'
[[ "$private_key" == "$private_key_confirmation" ]] || {
  unset private_key private_key_confirmation
  printf 'Las claves no coinciden.\n' >&2
  exit 1
}
unset private_key_confirmation

read -r -p "Dirección pública Ethereum (0x...): " public_address

derived_address="$(
  PRIVATE_KEY="$private_key" PUBLIC_ADDRESS="$public_address" node --input-type=module <<'EOF'
import { Wallet, getAddress } from 'ethers';

try {
  const wallet = new Wallet(process.env.PRIVATE_KEY);
  const expected = getAddress(process.env.PUBLIC_ADDRESS);
  if (wallet.address.toLowerCase() !== expected.toLowerCase()) {
    throw new Error('La dirección pública no corresponde a la clave privada.');
  }
  process.stdout.write(wallet.address);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
EOF
)"

update_env() {
  local file="$1"
  local private_name="$2"
  local public_name="$3"
  touch "$file"
  chmod 600 "$file"
  PRIVATE_KEY="$private_key" PUBLIC_ADDRESS="$derived_address" FILE="$file" \
    PRIVATE_NAME="$private_name" PUBLIC_NAME="$public_name" node --input-type=module <<'EOF'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const file = process.env.FILE;
const privateName = process.env.PRIVATE_NAME;
const publicName = process.env.PUBLIC_NAME;
const privateValue = process.env.PRIVATE_KEY;
const publicValue = process.env.PUBLIC_ADDRESS;
let content = readFileSync(file, 'utf8');

for (const [name, value] of [[privateName, privateValue], [publicName, publicValue]]) {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  if (pattern.test(content)) content = content.replace(pattern, line);
  else content += `${content.endsWith('\n') || content.length === 0 ? '' : '\n'}${line}\n`;
}
writeFileSync(file, content, { mode: 0o600 });
EOF
  printf 'Wallet configurada en %s (%s)\n' "$file" "$derived_address"
}

update_env backend/.env ETH_PRIVATE_KEY ETH_PUBLIC_ADDRESS
update_env blockchain/.env DEPLOYER_PRIVATE_KEY DEPLOYER_PUBLIC_ADDRESS
update_env examples/demo-dapp/.env DEMO_PRIVATE_KEY DEMO_PUBLIC_ADDRESS

unset private_key public_address derived_address
printf 'Wallet validada y configurada. No se imprime la clave privada.\n'
