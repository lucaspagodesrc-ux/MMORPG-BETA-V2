#!/bin/bash
# =====================================================================================
#  INSTALAÇÃO AUTOMÁTICA DO SERVIDOR DO JOGO NA ORACLE CLOUD (Ubuntu 22.04 ou 24.04)
#  Cole este arquivo inteiro no campo "Script de inicialização" (cloud-init) ao criar a
#  máquina. Antes, PREENCHA as linhas abaixo. Ele roda sozinho no primeiro boot (~10 min).
#  Registro da instalação: /var/log/mmorpg-instalar.log
# =====================================================================================
REPO="https://github.com/lucaspagodesrc-ux/MMORPG-BETA-V2.git"
GITHUB_TOKEN=""                 # só se o repositório for PRIVADO (token de acesso do GitHub, permissão "Contents: read")
DOMINIO="SEUJOGO.duckdns.org"   # o subdomínio que você criou no DuckDNS
DUCKDNS_TOKEN=""                # o "token" que aparece no topo do site do DuckDNS
DATABASE_URL=""                 # copie do Render (Environment) ou do Neon — começa com postgresql://
JWT_SECRET=""                   # copie do Render (Environment). Se trocar, todos precisam entrar de novo
GM_USER="GM123"
GM_PASS="GMSRC"
ALLOWED_ORIGINS=""              # endereço da página no Cloudflare, ex.: https://meujogo.pages.dev (vazio = aceita qualquer)
# =====================================================================================
set -u
exec > /var/log/mmorpg-instalar.log 2>&1
echo "== início $(date)"
export DEBIAN_FRONTEND=noninteractive
APP=/opt/mmorpg

# memória extra (as máquinas pequenas têm 1 GB; o npm precisa de mais na instalação)
if [ ! -f /swapfile ]; then fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi

apt-get update -y
apt-get install -y git curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https netfilter-persistent iptables-persistent

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Caddy (HTTPS automático com certificado gratuito)
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' -o /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y && apt-get install -y caddy

# libera as portas 80 e 443 no firewall interno da imagem da Oracle
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
netfilter-persistent save

# DuckDNS: aponta o domínio para o IP desta máquina (e mantém atualizado)
SUB="${DOMINIO%%.duckdns.org}"
if [ -n "$DUCKDNS_TOKEN" ]; then
  curl -s "https://www.duckdns.org/update?domains=$SUB&token=$DUCKDNS_TOKEN&ip=" ; echo
  echo "*/5 * * * * root curl -s 'https://www.duckdns.org/update?domains=$SUB&token=$DUCKDNS_TOKEN&ip=' >/dev/null 2>&1" > /etc/cron.d/duckdns
fi

# código do jogo
useradd -r -m -d /home/mmorpg -s /bin/bash mmorpg || true
URL="$REPO"; if [ -n "$GITHUB_TOKEN" ]; then URL="${REPO/https:\/\//https://x-access-token:$GITHUB_TOKEN@}"; fi
rm -rf "$APP"; git clone "$URL" "$APP"
cd "$APP" && npm install --omit=dev
chown -R mmorpg:mmorpg "$APP"

# variáveis do servidor (arquivo protegido)
cat > /etc/mmorpg.env <<ENV
NODE_ENV=production
PORT=3000
DATABASE_URL=$DATABASE_URL
PGSSL=true
JWT_SECRET=$JWT_SECRET
GM_USER=$GM_USER
GM_PASS=$GM_PASS
ALLOWED_ORIGINS=$ALLOWED_ORIGINS
ENV
chmod 600 /etc/mmorpg.env

# serviço que mantém o jogo sempre ligado (reinicia sozinho se cair e no boot)
cat > /etc/systemd/system/mmorpg.service <<UNIT
[Unit]
Description=Servidor do MMORPG
After=network-online.target
Wants=network-online.target
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

# HTTPS: Caddy recebe em 443 e repassa para o jogo (inclui as conexões do jogo, websockets)
cat > /etc/caddy/Caddyfile <<CADDY
$DOMINIO {
  encode gzip
  reverse_proxy 127.0.0.1:3000
}
CADDY
systemctl restart caddy

# atualização automática: a cada 2 minutos confere se houve mudança no GitHub e, se houve, atualiza e reinicia
install -m 755 "$APP/deploy/atualizar.sh" /usr/local/bin/mmorpg-atualizar
echo "*/2 * * * * root /usr/local/bin/mmorpg-atualizar >> /var/log/mmorpg-atualizar.log 2>&1" > /etc/cron.d/mmorpg-atualizar
echo "== fim $(date)"
