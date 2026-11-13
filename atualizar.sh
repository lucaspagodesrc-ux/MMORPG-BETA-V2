#!/bin/bash
# Atualiza o servidor quando há mudança no GitHub (roda sozinho a cada 2 min; pode rodar na mão: sudo mmorpg-atualizar)
APP=/opt/mmorpg
cd "$APP" || exit 1
git config --global --add safe.directory "$APP" 2>/dev/null
git fetch -q origin || exit 0
BR=$(git rev-parse --abbrev-ref origin/HEAD 2>/dev/null | sed 's#origin/##'); BR=${BR:-main}
L=$(git rev-parse HEAD); R=$(git rev-parse "origin/$BR")
[ "$L" = "$R" ] && exit 0
echo "== $(date) atualizando $L -> $R"
PK=$(git diff --name-only "$L" "$R" | grep -c '^package')
git reset -q --hard "origin/$BR"
[ "$PK" != "0" ] && npm install --omit=dev
chown -R mmorpg:mmorpg "$APP"
cp "$APP/deploy/atualizar.sh" /usr/local/bin/mmorpg-atualizar 2>/dev/null
[ -f "$APP/deploy/backup.sh" ] && cp "$APP/deploy/backup.sh" /usr/local/bin/mmorpg-backup 2>/dev/null
[ -f "$APP/deploy/importar-neon.sh" ] && cp "$APP/deploy/importar-neon.sh" /usr/local/bin/mmorpg-importar-neon 2>/dev/null
systemctl restart mmorpg
echo "== reiniciado"
