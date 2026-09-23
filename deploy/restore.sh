#!/usr/bin/env bash
# Restaura un backup (DESTRUCTIVO: reemplaza la base actual).
#
#   ./deploy/restore.sh deploy/backups/db_XXXX.sql.gz [deploy/backups/filestore_XXXX.tar.gz]
#
# Sirve también para el simulacro de restore en un servidor limpio (levantar el
# stack con `up -d`, y correr esto). Siempre restaura con PGCLIENTENCODING=UTF8:
# pasar el dump por un pipe de PowerShell rompe los acentos.
set -euo pipefail
cd "$(dirname "$0")/.."
source .env

DUMP="${1:?Uso: $0 <db.sql.gz> [filestore.tar.gz]}"
FSTAR="${2:-}"
COMPOSE=(docker compose -f "${COMPOSE_FILE:-docker-compose.prod.yml}")

[ -f "$DUMP" ] || { echo "No existe $DUMP" >&2; exit 1; }
gzip -t "$DUMP"
echo "Esto BORRA la base '$DB_NAME' y la reemplaza por $DUMP."
read -r -p "Escribí el nombre de la base para confirmar: " ok
[ "$ok" = "$DB_NAME" ] || { echo "Cancelado."; exit 1; }

"${COMPOSE[@]}" stop odoo
"${COMPOSE[@]}" exec -T db psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$DB_NAME\"" \
  -c "CREATE DATABASE \"$DB_NAME\" ENCODING 'UTF8' TEMPLATE template0"
gunzip -c "$DUMP" | "${COMPOSE[@]}" exec -T -e PGCLIENTENCODING=UTF8 db \
  psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -q >/dev/null

if [ -n "$FSTAR" ]; then
  gzip -t "$FSTAR"
  "${COMPOSE[@]}" run --rm --no-deps -T --entrypoint bash odoo -c \
    "rm -rf /var/lib/odoo/filestore/$DB_NAME && tar xzf - -C /var/lib/odoo" < "$FSTAR"
fi

"${COMPOSE[@]}" up -d odoo
echo "Restore completo. Verificá: login, un POS, y que los acentos se vean bien."
