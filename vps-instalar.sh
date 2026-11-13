#!/bin/bash
# =====================================================================================
#  INSTALAÇÃO DO SERVIDOR DO JOGO NUMA VPS (Hostinger ou qualquer Ubuntu 22.04/24.04)
#  Instala: Node.js 20, PostgreSQL (banco LOCAL, sem limites), Caddy (HTTPS automático),
#  firewall, DuckDNS, serviço sempre ligado, atualização automática pelo GitHub e
#  backup diário do banco. Copia as contas/personagens do Neon (se você informar o endereço).
#
#  Como rodar (como root, no "Terminal do navegador" da Hostinger):
#    apt-get update && apt-get install -y git && git clone https://github.com/lucaspagodesrc-ux/MMORPG-BETA-V2.git /opt/mmorpg && bash /opt/mmorpg/deploy/vps-instalar.sh
#  Ele faz algumas perguntas no começo e depois roda sozinho (~5–10 min).
#  Registro: /var/log/mmorpg-instalar.log
# =====================================================================================
set -u
APP=/opt/mmorpg
[ "$(id -u)" = "0" ] || { echo "Rode como root (sudo -i)."; exit 1; }
[ -d "$APP/.git" ] || { echo "Não achei o jogo em $APP. Rode o comando completo do LEIA-ME (git clone ...)."; exit 1; }

echo
echo "=============== PERGUNTAS (cole cada resposta e aperte Enter) ==============="
read -rp "1) Seu domínio do DuckDNS (ex.: projetommorpg.duckdns.org): " DOMINIO
DOMINIO="${DOMINIO#https://}"; DOMINIO="${DOMINIO#http://}"; DOMINIO="${DOMINIO%%/*}"
read -rp "2) Token do DuckDNS: " DUCKDNS_TOKEN
read -rp "3) DATABASE_URL antigo do Render/Neon (para copiar as contas; Enter = começar banco vazio): " NEON_URL
read -rp "4) JWT_SECRET do Render (Enter = gerar um novo; aí todos fazem login de novo): " JWT_SECRET
read -rp "5) Endereço da página no Cloudflare (ex.: https://meujogo.pages.dev; Enter = aceitar qualquer): " ALLOWED_ORIGINS
read -rp "6) Usuário GM [GM123]: " GM_USER; GM_USER=${GM_USER:-GM123}
read -rp "7) Senha GM [GMSRC]: " GM_PASS; GM_PASS=${GM_PASS:-GMSRC}
[ -z "$JWT_SECRET" ] && JWT_SECRET=$(openssl rand -hex 32)
echo "============================================================================"
echo "Instalando... pode levar ~10 min. Não feche esta janela."
exec > >(tee -a /var/log/mmorpg-instalar.log) 2>&1
echo "== início $(date)"
export DEBIAN_FRONTEND=noninteractive

# memória extra de segurança
if [ ! -f /swapfile ]; then fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi

apt-get update -y
apt-get install -y git curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https ufw openssl postgresql-common

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# PostgreSQL (repositório oficial; versão nova para conseguir copiar do Neon)
yes '' | /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
apt-get update -y
PGV=""
for v in 18 17; do if apt-get install -y "postgresql-$v"; then PGV=$v; break; fi; done
[ -z "$PGV" ] && { apt-get install -y postgresql; PGV=$(ls /usr/lib/postgresql | sort -n | tail -1); }
PGB=/usr/lib/postgresql/$PGV/bin
systemctl enable --now postgresql
DBPASS=$(openssl rand -hex 16)
sudo -u postgres psql -qc "do \$\$ begin if not exists (select from pg_roles where rolname='mmorpg') then create role mmorpg login password '$DBPASS'; else alter role mmorpg password '$DBPASS'; end if; end \$\$;"
sudo -u postgres psql -tAc "select 1 from pg_database where datname='mmorpg'" | grep -q 1 || sudo -u postgres createdb -O mmorpg mmorpg
LOCAL_URL="postgres://mmorpg:$DBPASS@127.0.0.1:5432/mmorpg"
echo "PostgreSQL $PGV pronto"

# Caddy (HTTPS automático com certificado gratuito)
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' -o /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y && apt-get install -y caddy

# firewall: só SSH, 80 e 443 (o banco fica fechado para a internet)
ufw allow OpenSSH >/dev/null; ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
ufw --force enable

# DuckDNS: aponta o domínio para o IP desta máquina (e mantém atualizado)
SUB="${DOMINIO%%.duckdns.org}"
if [ -n "$DUCKDNS_TOKEN" ]; then
  echo -n "DuckDNS: "; curl -s "https://www.duckdns.org/update?domains=$SUB&token=$DUCKDNS_TOKEN&ip=" ; echo
  echo "*/5 * * * * root curl -s 'https://www.duckdns.org/update?domains=$SUB&token=$DUCKDNS_TOKEN&ip=' >/dev/null 2>&1" > /etc/cron.d/duckdns
fi

# variáveis do servidor (arquivo protegido)
cat > /etc/mmorpg.env <<ENV
NODE_ENV=production
PORT=3000
DATABASE_URL=$LOCAL_URL
PGSSL=false
JWT_SECRET=$JWT_SECRET
GM_USER=$GM_USER
GM_PASS=$GM_PASS
ALLOWED_ORIGINS=$ALLOWED_ORIGINS
ENV
chmod 600 /etc/mmorpg.env
echo "PGBIN=$PGB" > /etc/mmorpg-pg.conf

# ferramentas: importar do Neon, backup, atualizar
install -m 755 "$APP/deploy/importar-neon.sh" /usr/local/bin/mmorpg-importar-neon
install -m 755 "$APP/deploy/backup.sh" /usr/local/bin/mmorpg-backup
install -m 755 "$APP/deploy/atualizar.sh" /usr/local/bin/mmorpg-atualizar

# copia contas e personagens do Neon ANTES de ligar o jogo
if [ -n "$NEON_URL" ]; then
  MMORPG_SEM_PERGUNTA=1 /usr/local/bin/mmorpg-importar-neon "$NEON_URL" || echo "!! A cópia do Neon falhou. O jogo vai ligar com banco vazio. Depois rode: mmorpg-importar-neon"
fi

# código do jogo
useradd -r -m -d /home/mmorpg -s /bin/bash mmorpg 2>/dev/null || true
git config --global --add safe.directory "$APP"
cd "$APP" && npm install --omit=dev
chown -R mmorpg:mmorpg "$APP"

# serviço que mantém o jogo sempre ligado (reinicia sozinho se cair e no boot)
cat > /etc/systemd/system/mmorpg.service <<UNIT
[Unit]
Description=Servidor do MMORPG
After=network-online.target postgresql.service
Wants=network-online.target postgresql.service
[Service]
User=mmorpg
WorkingDirectory=$APP
EnvironmentFile=/etc/mmorpg.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload && systemctl enable --now mmorpg

# HTTPS: Caddy recebe em 443 e repassa para o jogo (inclui websockets)
cat > /etc/caddy/Caddyfile <<CADDY
$DOMINIO {
  encode gzip
  reverse_proxy 127.0.0.1:3000
}
CADDY
systemctl restart caddy

# tarefas automáticas: atualizar pelo GitHub (2 min) e backup do banco (todo dia 04:00, guarda 14 dias)
echo "*/2 * * * * root /usr/local/bin/mmorpg-atualizar >> /var/log/mmorpg-atualizar.log 2>&1" > /etc/cron.d/mmorpg-atualizar
echo "0 4 * * * root /usr/local/bin/mmorpg-backup >> /var/log/mmorpg-backup.log 2>&1" > /etc/cron.d/mmorpg-backup

sleep 8
echo
echo "============================================================================"
if curl -fs http://127.0.0.1:3000/health >/dev/null; then echo "✅ Servidor do jogo LIGADO."; else echo "⚠️  O servidor ainda não respondeu. Veja: journalctl -u mmorpg -n 50"; fi
N=$(sudo -u postgres psql -d mmorpg -tAc "select count(*) from characters" 2>/dev/null || echo 0)
echo "Personagens no banco: $N"
echo "Teste no navegador (pode levar 1–2 min para o HTTPS): https://$DOMINIO/health"
echo "No Cloudflare Pages, use GAME_SERVER = https://$DOMINIO"
echo "== fim $(date)"
