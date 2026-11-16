#!/usr/bin/env bash
# Actualiza los usuarios (lista en app/scripts/usuarios.mjs) y les pone la clave que escribas.
#   cd app/servidor && ./usuarios.sh
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"; APP="$(cd "$AQUI/.." && pwd)"
SRK="$(grep -m1 '^SERVICE_ROLE_KEY=' "$AQUI/supabase/.env" | cut -d= -f2-)"
read -r -s -p "Clave para todos los usuarios: " CLAVE; echo
if command -v node >/dev/null && command -v npm >/dev/null; then
  (cd "$APP" && [ -d node_modules/@supabase ] || npm ci --silent --no-audit --no-fund
   cd "$APP" && SUPABASE_URL=http://127.0.0.1:8000 SUPABASE_SERVICE_ROLE_KEY="$SRK" CLAVE="$CLAVE" node scripts/usuarios.mjs)
else
  docker run --rm --network supabase_default -v "$APP":/src:ro -e SUPABASE_URL=http://kong:8000 \
    -e SUPABASE_SERVICE_ROLE_KEY="$SRK" -e CLAVE="$CLAVE" node:22-alpine sh -c \
    "mkdir /app && cd /src && tar --exclude=node_modules --exclude=servidor -cf - . | tar -xf - -C /app && cd /app && npm ci --silent --no-audit --no-fund && node scripts/usuarios.mjs"
fi
