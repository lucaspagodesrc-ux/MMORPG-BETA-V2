#!/bin/bash
# Backup do banco do jogo (roda sozinho todo dia às 04:00; guarda os últimos 14 dias)
# Arquivos em /var/backups/mmorpg/  •  Para restaurar um backup: mmorpg-restaurar ARQUIVO (veja o LEIA-ME)
. /etc/mmorpg-pg.conf 2>/dev/null; PGBIN=${PGBIN:-/usr/bin}
D=/var/backups/mmorpg; mkdir -p "$D"; chown postgres "$D"
F="$D/jogo-$(date +%Y%m%d-%H%M).dump"
sudo -u postgres "$PGBIN/pg_dump" -Fc -d mmorpg -f "$F" && echo "$(date) backup ok: $F ($(du -h "$F" | cut -f1))"
find "$D" -name 'jogo-*.dump' -mtime +14 -delete
