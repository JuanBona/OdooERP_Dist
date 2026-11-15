#!/usr/bin/env bash
# Instala Rincón del Sur en el servidor: Supabase (Docker) + la app con HTTPS.
#
#   cd app/servidor
#   ./instalar.sh rincondelsur.com.ar      # dominio que apunta a este servidor
#
# Se puede correr de nuevo sin perder datos: no regenera claves, aplica solo migraciones nuevas,
# no duplica usuarios/productos/clientes y vuelve a publicar la app.
set -euo pipefail

DOMINIO="${1:-}"
[ -n "$DOMINIO" ] || { echo "Uso: ./instalar.sh <dominio>   (ej: ./instalar.sh rincondelsur.com.ar, o localhost para probar)"; exit 1; }
for c in docker openssl; do command -v $c >/dev/null || { echo "Falta $c"; exit 1; }; done

AQUI="$(cd "$(dirname "$0")" && pwd)"
APP="$(cd "$AQUI/.." && pwd)"
SB="$AQUI/supabase"
DC=(docker compose -f "$SB/docker-compose.yml" -f "$AQUI/docker-compose.rincon.yml")
cd "$SB"

poner() { # poner VARIABLE valor  → escribe/reemplaza en supabase/.env
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}

# 1. Claves (solo la primera vez)
if [ ! -f .env ]; then
  echo "== Generando claves =="
  cp .env.example .env
  sh utils/generate-keys.sh --update-env >/dev/null
  poner POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  poner DASHBOARD_PASSWORD "$(openssl rand -hex 12)"
  poner DASHBOARD_USERNAME "admin"
  poner CLAVE_INICIAL "$(openssl rand -hex 4)"
  chmod 600 .env
fi
poner DOMINIO "$DOMINIO"
poner SITE_URL "https://$DOMINIO"
poner SUPABASE_PUBLIC_URL "https://$DOMINIO"
poner API_EXTERNAL_URL "https://$DOMINIO/auth/v1"
poner DISABLE_SIGNUP "true"            # nadie se puede registrar solo: los usuarios los crea Gerencia
poner ENABLE_EMAIL_AUTOCONFIRM "true"
leer() { grep -m1 "^$1=" .env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
ANON_KEY="$(leer ANON_KEY)"; SERVICE_ROLE_KEY="$(leer SERVICE_ROLE_KEY)"; CLAVE_INICIAL="$(leer CLAVE_INICIAL)"
DASHBOARD_USERNAME="$(leer DASHBOARD_USERNAME)"; DASHBOARD_PASSWORD="$(leer DASHBOARD_PASSWORD)"

# 2. Levantar Supabase
echo "== Levantando Supabase (la primera vez baja las imágenes, tarda unos minutos) =="
mkdir -p "$AQUI/app-web"
"${DC[@]}" up -d
echo -n "Esperando la base"; until docker exec supabase-db pg_isready -U postgres -h localhost >/dev/null 2>&1; do echo -n .; sleep 2; done; echo

psqlx() { docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

# 3. Esperar que todo Supabase esté listo (la API responde y el servicio de fotos creó sus tablas)
echo -n "Esperando la API"; until curl -fsS -o /dev/null -H "apikey: $ANON_KEY" http://127.0.0.1:8000/auth/v1/health 2>/dev/null; do echo -n .; sleep 3; done; echo
echo -n "Esperando el servicio de fotos"; until [ "$(psqlx -tAc "select to_regclass('storage.buckets') is not null")" = "t" ]; do echo -n .; sleep 3; done; echo

# 4. Migraciones: cada una se aplica una sola vez y entera (si falla, no queda a medias)
echo "== Base de datos =="
psqlx -c "create table if not exists public.rincon_migraciones (archivo text primary key, aplicada timestamptz default now())"
for f in "$APP"/supabase/migrations/*.sql; do
  n="$(basename "$f")"
  if [ "$(psqlx -tAc "select 1 from public.rincon_migraciones where archivo = '$n'")" != "1" ]; then
    echo "  aplicando $n"
    { cat "$f"; echo; echo "insert into public.rincon_migraciones(archivo) values ('$n');"; } | psqlx -1
  fi
done
psqlx -c "revoke all on public.rincon_migraciones from anon, authenticated"
# Entregas automáticas: 00:05 de cada día pasa a Entregado lo que salió en reparto el día anterior
psqlx -c "create extension if not exists pg_cron" -c "select cron.schedule('cierre-reparto', '5 0 * * *', 'select public.cerrar_reparto()')" >/dev/null

# Node: usa el del servidor si está instalado; si no, un contenedor (trabajando sobre una copia,
# así no se pisan las librerías de la carpeta del repo).
node_run() { # node_run "<variables>" "<comandos>"   (en una copia de app/ con sus dependencias)
  if command -v node >/dev/null && command -v npm >/dev/null; then
    (cd "$APP" && npm ci --silent --no-audit --no-fund && env $1 sh -c "$2")
  else
    docker run --rm --network supabase_default -v "$APP":/src:ro node:22-alpine sh -c \
      "mkdir /app && cd /src && tar --exclude=node_modules --exclude=servidor -cf - . | tar -xf - -C /app && cd /app && npm ci --silent --no-audit --no-fund && env $1 sh -c '$2'"
  fi
}
if command -v node >/dev/null; then API_INTERNA="http://127.0.0.1:8000"; else API_INTERNA="http://kong:8000"; fi

# 5. Usuarios, productos y clientes (no duplica)
echo "== Datos iniciales =="
node_run "SUPABASE_URL=$API_INTERNA SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY CLAVE_INICIAL=$CLAVE_INICIAL" "node scripts/cargar_datos.mjs"

# 6. Publicar la app
echo "== Publicando la app =="
rm -rf "$AQUI/app-web.nuevo"; mkdir -p "$AQUI/app-web.nuevo"
if command -v node >/dev/null; then
  node_run "VITE_SUPABASE_URL=https://$DOMINIO VITE_SUPABASE_ANON_KEY=$ANON_KEY" "npx vite build --outDir '$AQUI/app-web.nuevo' --emptyOutDir >/dev/null"
else
  docker run --rm -v "$APP":/src:ro -v "$AQUI/app-web.nuevo":/out node:22-alpine sh -c \
    "mkdir /app && cd /src && tar --exclude=node_modules --exclude=servidor -cf - . | tar -xf - -C /app && cd /app && npm ci --silent --no-audit --no-fund && VITE_SUPABASE_URL=https://$DOMINIO VITE_SUPABASE_ANON_KEY=$ANON_KEY npx vite build --outDir /out --emptyOutDir >/dev/null"
fi
rm -rf "$AQUI/app-web"; mv "$AQUI/app-web.nuevo" "$AQUI/app-web"
"${DC[@]}" restart web >/dev/null

cat <<EOF

==============================================================
 Listo: https://$DOMINIO

 Usuarios: vendedor1, vendedor2, deposito, admin, gerencia
 Clave inicial de todos: $CLAVE_INICIAL   (cambiarla desde el panel)

 Panel de Supabase (usuarios, claves, datos), solo por túnel SSH:
   ssh -L 8000:localhost:8000 <usuario>@<servidor>   y abrir http://localhost:8000
   usuario: $DASHBOARD_USERNAME   clave: $DASHBOARD_PASSWORD

 Las claves quedaron en app/servidor/supabase/.env (no se sube al repo).
 Backup diario: ver app/servidor/backup.sh
==============================================================
EOF
