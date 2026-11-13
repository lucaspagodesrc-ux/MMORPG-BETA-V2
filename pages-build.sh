#!/bin/bash
# Monta a pasta "dist" que o Cloudflare Pages publica (página, regras, modelos 3D, música e cliente do jogo).
# No Cloudflare Pages: comando de build = bash deploy/pages-build.sh | pasta de saída = dist
# Variável de ambiente no Cloudflare: GAME_SERVER = https://SEUJOGO.duckdns.org
set -e
rm -rf dist && mkdir -p dist/colyseus-client dist/modelos dist/audio
cp index.html rules.js dist/
cp colyseus-browser.js dist/colyseus-client/colyseus.js
for f in *.glb; do [ -f "$f" ] && cp "$f" dist/modelos/; done
M=$(ls tema.mp3 2>/dev/null || ls *.mp3 2>/dev/null | head -1 || true); [ -n "$M" ] && cp "$M" dist/audio/tema.mp3
echo "window.GAME_SERVER='${GAME_SERVER:-}';" > dist/config.js
cat > dist/_headers <<'H'
/
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/rules.js
  Cache-Control: no-cache
/config.js
  Cache-Control: no-cache
/modelos/*
  Cache-Control: public, max-age=86400
/audio/*
  Cache-Control: public, max-age=604800
/colyseus-client/*
  Cache-Control: public, max-age=604800
H
echo "dist pronto:"; ls -la dist dist/modelos
