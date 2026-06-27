#!/bin/bash
set -euo pipefail
TS=$(date +%Y%m%d-%H%M%S)
OUT=/var/backups/repetitory/db-$TS.sql.gz
docker exec -i repetitory-db pg_dump -U postgres -d postgres --clean --if-exists | gzip -9 > $OUT
chmod 600 $OUT
# Удаляем бэкапы старше 14 дней
find /var/backups/repetitory -name "db-*.sql.gz" -mtime +14 -delete
# Логируем
echo "$(date -Iseconds) backup ok: $OUT ($(stat -c%s $OUT) bytes)" >> /var/log/repetitory-backup.log
