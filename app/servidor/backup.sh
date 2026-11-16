#!/usr/bin/env bash
# Backup de la base (datos + usuarios) y de las fotos. Guarda los últimos 30 días.
# Programarlo todos los días a las 3 AM:
#   crontab -e   →   0 3 * * * /ruta/al/repo/app/servidor/backup.sh >> /var/log/rincon-backup.log 2>&1
set -euo pipefail
DESTINO="${BACKUP_DIR:-/var/backups/rincon}"
AQUI="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$DESTINO"
F="$(date +%F_%H%M)"
docker exec supabase-db pg_dumpall -U postgres --clean --if-exists | gzip > "$DESTINO/base-$F.sql.gz"
tar -czf "$DESTINO/fotos-$F.tar.gz" -C "$AQUI/supabase/volumes" storage 2>/dev/null || true
find "$DESTINO" -type f -mtime +30 -delete
echo "$(date) backup ok: $DESTINO/base-$F.sql.gz"
# Restaurar (¡pisa la base actual!):  gunzip -c base-XXXX.sql.gz | docker exec -i supabase-db psql -U postgres -d postgres
