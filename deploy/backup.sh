#!/usr/bin/env bash
# Backup diario de la base de producción. Pensado para correr por cron en el
# HOST del VPS (no dentro de un container), en el directorio del repo.
#
# Crontab sugerido (todos los días 3am):
#   0 3 * * * /ruta/al/repo/deploy/backup.sh >> /var/log/reparto-backup.log 2>&1
#
# Retención: guarda los últimos 14 dumps diarios en deploy/backups/ y borra
# el resto. Además, si RCLONE_REMOTE está seteado, sube una copia fuera del
# VPS (para que un backup no dependa de que el VPS siga vivo).

set -euo pipefail
cd "$(dirname "$0")/.."

source .env

STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_DIR="deploy/backups"
OUT_FILE="$OUT_DIR/odoo_${STAMP}.sql.gz"
RETENTION_DAYS=14

mkdir -p "$OUT_DIR"

docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$OUT_FILE"

echo "Backup guardado: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"

find "$OUT_DIR" -name 'odoo_*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete

# Copia fuera del VPS — configurar rclone (rclone.org) apuntando a un bucket
# S3-compatible (Hetzner Storage Box, Backblaze B2, etc.) y descomentar.
# Requiere: rclone config (una vez, a mano) + RCLONE_REMOTE en .env
# (ej: RCLONE_REMOTE=mi-backup:reparto-backups).
#
# if [ -n "${RCLONE_REMOTE:-}" ]; then
#   rclone copy "$OUT_FILE" "$RCLONE_REMOTE"
# fi
