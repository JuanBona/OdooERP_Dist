#!/usr/bin/env bash
# Backup de la base + filestore. Correr por cron en el HOST del VPS, en el repo.
#
# Crontab sugerido (cada 4 hs => pérdida máxima de datos ~4 hs):
#   0 */4 * * * /opt/reparto/deploy/backup.sh >> /var/log/reparto-backup.log 2>&1
#
# - Local: deploy/backups/, retención 7 días.
# - Off-site (recomendado, obligatorio en producción): RCLONE_REMOTE en .env
#   (ej. b2crypt:reparto-cliente). Usar un remoto `crypt` de rclone para cifrar.
#   Retención remota 30 días.
# - Alerta: HC_PING_URL en .env (healthchecks.io). Se pinguea solo si TODO salió
#   bien; si el cron deja de pingear (o falla), healthchecks avisa por mail.
set -euo pipefail
cd "$(dirname "$0")/.."
source .env

COMPOSE=(docker compose -f "${COMPOSE_FILE:-docker-compose.prod.yml}")
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_DIR="deploy/backups"
DUMP="$OUT_DIR/db_${STAMP}.sql.gz"
FSTAR="$OUT_DIR/filestore_${STAMP}.tar.gz"
LOCAL_RETENTION_DAYS=7
REMOTE_RETENTION="30d"

[ -n "${HC_PING_URL:-}" ] && trap 'curl -fsS -m 10 --retry 3 "${HC_PING_URL}/fail" >/dev/null || true' ERR

mkdir -p "$OUT_DIR"

"${COMPOSE[@]}" exec -T db pg_dump -U "$DB_USER" --no-owner --no-privileges "$DB_NAME" | gzip > "$DUMP"
gzip -t "$DUMP"
[ "$(stat -c %s "$DUMP")" -gt 1024 ] || { echo "Dump sospechosamente chico: $DUMP" >&2; exit 1; }

"${COMPOSE[@]}" exec -T odoo tar czf - -C /var/lib/odoo filestore > "$FSTAR"
gzip -t "$FSTAR"

echo "$(date -Is) OK: $DUMP ($(du -h "$DUMP" | cut -f1)), $FSTAR ($(du -h "$FSTAR" | cut -f1))"

find "$OUT_DIR" \( -name 'db_*.sql.gz' -o -name 'filestore_*.tar.gz' \) -mtime "+${LOCAL_RETENTION_DAYS}" -delete

if [ -n "${RCLONE_REMOTE:-}" ]; then
  rclone copy "$DUMP" "$RCLONE_REMOTE"
  rclone copy "$FSTAR" "$RCLONE_REMOTE"
  rclone delete "$RCLONE_REMOTE" --min-age "$REMOTE_RETENTION"
  echo "$(date -Is) Copia off-site OK: $RCLONE_REMOTE"
else
  echo "ADVERTENCIA: RCLONE_REMOTE vacío, backup SOLO local (no cubre la pérdida del VPS)" >&2
fi

[ -n "${HC_PING_URL:-}" ] && curl -fsS -m 10 --retry 3 "$HC_PING_URL" >/dev/null || true
