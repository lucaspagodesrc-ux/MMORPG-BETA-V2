#!/bin/bash
# Copia TODAS as contas, personagens, guildas, leilão etc. do banco antigo (Neon) para o banco desta VPS.
# Uso: mmorpg-importar-neon "postgresql://...neon.tech/...?sslmode=require"
# ATENÇÃO: substitui o banco local pelo conteúdo do Neon.
set -u
. /etc/mmorpg-pg.conf 2>/dev/null; PGBIN=${PGBIN:-/usr/bin}
SRC="${1:-}"
[ -z "$SRC" ] && read -rp "DATABASE_URL do Neon: " SRC
[ -z "$SRC" ] && { echo "Nada a fazer."; exit 1; }
if [ -z "${MMORPG_SEM_PERGUNTA:-}" ]; then
  read -rp "Isto APAGA o banco desta VPS e coloca o do Neon no lugar. Digite SIM para continuar: " ok
  [ "$ok" = "SIM" ] || { echo "Cancelado."; exit 1; }
fi
TMP=/var/backups/mmorpg; mkdir -p "$TMP"; F="$TMP/neon-$(date +%Y%m%d-%H%M).dump"
echo "Baixando do Neon..."
if ! "$PGBIN/pg_dump" -Fc --no-owner --no-acl -d "$SRC" -f "$F"; then
  echo "!! Não consegui ler o Neon. Confira o endereço. Se o Neon estourou a cota do mês, ele só volta no próximo ciclo."
  exit 1
fi
systemctl stop mmorpg 2>/dev/null
chown postgres "$TMP"; sudo -u postgres "$PGBIN/pg_dump" -Fc -d mmorpg -f "$TMP/local-antes-import-$(date +%Y%m%d-%H%M).dump" 2>/dev/null   # segurança: guarda o banco local antes de substituir
sudo -u postgres psql -qc "drop database if exists mmorpg with (force);" && sudo -u postgres createdb -O mmorpg mmorpg
chmod 644 "$F"
sudo -u postgres "$PGBIN/pg_restore" --no-owner --role=mmorpg -d mmorpg "$F" || echo "(avisos acima costumam ser inofensivos)"
sudo -u postgres psql -d mmorpg -qc "grant all on schema public to mmorpg; grant all on all tables in schema public to mmorpg; grant all on all sequences in schema public to mmorpg;"
for t in $(sudo -u postgres psql -d mmorpg -tAc "select tablename from pg_tables where schemaname='public'"); do sudo -u postgres psql -d mmorpg -qc "alter table public.\"$t\" owner to mmorpg"; done
for s in $(sudo -u postgres psql -d mmorpg -tAc "select sequencename from pg_sequences where schemaname='public'"); do sudo -u postgres psql -d mmorpg -qc "alter sequence public.\"$s\" owner to mmorpg"; done
echo "Contas: $(sudo -u postgres psql -d mmorpg -tAc 'select count(*) from accounts')  •  Personagens: $(sudo -u postgres psql -d mmorpg -tAc 'select count(*) from characters')"
systemctl start mmorpg 2>/dev/null
echo "Importação concluída."
