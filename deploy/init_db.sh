#!/usr/bin/env bash
# Crea una base LIMPIA de producción (sin datos de prueba): localización AR,
# es_AR, módulos del sistema de reparto. Correr una sola vez por cliente, con
# el stack levantado (docker compose -f docker-compose.prod.yml up -d).
#
#   ./deploy/init_db.sh "Nombre de la Empresa"
#
# Variables (se leen de .env): DB_NAME DB_USER DB_PASSWORD. COMPOSE_FILE opcional.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && source .env

COMPANY_NAME="${1:?Uso: $0 \"Nombre de la Empresa\"}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DB_NAME="${DB_NAME:-odoo}"
DB_USER="${DB_USER:-odoo}"
: "${DB_PASSWORD:?Falta DB_PASSWORD (.env)}"

# Apps de Odoo + módulos custom (las dependencias entre custom las resuelve Odoo).
MODULES="point_of_sale,sale_management,stock,account,sale_stock,pos_sale,l10n_ar,l10n_ar_stock,\
pos_stock_limit,pos_reparto_security,pos_reparto_pricelist,pos_reparto_branding,pos_reparto_home,\
pos_reparto_credito,pos_reparto_remito,pos_reparto_viaje,pos_reparto_descuento_volumen,pos_reparto_comision"

ODOO=(docker compose -f "$COMPOSE_FILE" exec -T odoo odoo)
DBARGS=(-d "$DB_NAME" --db_host=db --db_user="$DB_USER" --db_password="$DB_PASSWORD")

echo "==> 1/3 Base + idioma es_AR"
"${ODOO[@]}" "${DBARGS[@]}" -i base --load-language es_AR --without-demo=all --no-http --stop-after-init

echo "==> 2/3 Compañía: país Argentina, moneda ARS, zona horaria"
"${ODOO[@]}" shell "${DBARGS[@]}" --no-http <<PY
ars = env.ref('base.ARS'); ars.active = True
env.company.write({'name': """$COMPANY_NAME""", 'country_id': env.ref('base.ar').id, 'currency_id': ars.id})
admin = env.ref('base.user_admin')
admin.write({'lang': 'es_AR', 'tz': 'America/Argentina/Buenos_Aires'})
env.company.partner_id.lang = 'es_AR'
env.cr.commit()
PY

echo "==> 3/3 Módulos (tarda varios minutos)"
"${ODOO[@]}" "${DBARGS[@]}" -i "$MODULES" --without-demo=all --no-http --stop-after-init

echo "==> Reiniciando Odoo (cache de menús/assets)"
docker compose -f "$COMPOSE_FILE" restart odoo
echo "Listo. Entrar como admin (password 'admin') y CAMBIARLA de inmediato."
