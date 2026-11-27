#!/bin/bash
# Monta a pasta "dist" que o Cloudflare Pages publica (página, regras, modelos 3D, música e cliente do jogo).
# No Cloudflare Pages: comando de build = bash deploy/pages-build.sh | pasta de saída = dist
# Variável de ambiente no Cloudflare: GAME_SERVER = https://SEUJOGO.duckdns.org
set -e
rm -rf dist && mkdir -p dist/colyseus-client dist/modelos dist/audio dist/telas dist/fx
cp index.html rules.js lang_en.js dist/
cp colyseus-browser.js dist/colyseus-client/colyseus.js
for f in *.glb; do [ -f "$f" ] && cp "$f" dist/modelos/; done
for f in rostos_*.png rosto2_*.png; do [ -f "$f" ] && cp "$f" dist/modelos/; done   # v1.95: camadas do rosto (olhos, sobrancelhas, boca) montadas no navegador
for f in fx_*.webp sx_*.webp; do [ -f "$f" ] && cp "$f" dist/fx/; done   # v2.4.2/2.4.3: spritesheets dos efeitos (habilidades, impactos, estados, montarias, mascotes)
for f in tela_*.jpg; do [ -f "$f" ] && cp "$f" dist/telas/; done   # v1.85: artes do login e da tela de carregamento
M=$(ls tema.mp3 2>/dev/null || ls *.mp3 2>/dev/null | grep -v "^sfx" | head -1 || true); [ -n "$M" ] && cp "$M" dist/audio/tema.mp3
[ -f sfx.mp3 ] && cp sfx.mp3 dist/audio/sfx.mp3   # v2.2.6: efeitos sonoros gravados (habilidades, monstros, passos, ambiente)
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
/telas/*
  Cache-Control: public, max-age=604800
/fx/*
  Cache-Control: public, max-age=604800
/audio/*
  Cache-Control: public, max-age=604800
/colyseus-client/*
  Cache-Control: public, max-age=604800
H
echo "dist pronto:"; ls -la dist dist/modelos dist/telas dist/fx
