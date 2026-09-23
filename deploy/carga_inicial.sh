#!/usr/bin/env bash
# Carga inicial (productos, clientes, camiones, usuarios). Por defecto es un ENSAYO
# que no guarda nada; con --guardar persiste. Correr un backup antes de guardar.
#
#   ./deploy/carga_inicial.sh <carpeta_con_csv>            # ensayo
#   ./deploy/carga_inicial.sh <carpeta_con_csv> --guardar  # de verdad
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && source .env

DIR="${1:?Uso: $0 <carpeta_con_csv> [--guardar]}"
COMMIT=0; [ "${2:-}" = "--guardar" ] && COMMIT=1
COMPOSE=(docker compose -f "${COMPOSE_FILE:-docker-compose.prod.yml}")
: "${DB_PASSWORD:?Falta DB_PASSWORD (.env)}"

"${COMPOSE[@]}" exec -T -u root odoo rm -rf /tmp/carga
"${COMPOSE[@]}" cp "$DIR" odoo:/tmp/carga
"${COMPOSE[@]}" exec -T -e COMMIT="$COMMIT" odoo odoo shell -d "${DB_NAME:-odoo}" \
  --db_host=db --db_user="${DB_USER:-odoo}" --db_password="$DB_PASSWORD" --no-http \
  --log-level=warn < deploy/carga_inicial.py
"${COMPOSE[@]}" exec -T -u root odoo rm -rf /tmp/carga
