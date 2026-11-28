# Valdoria Online — resumo do projeto para continuar com outra IA
_Atualizado em 21/11/2026 · versão do cliente v2.3.3 · rules.js VERSION 4_

Cole este arquivo no início da conversa com a outra IA. Depois mande **só o trecho** do código que for mexer: o `index.html` tem 1,5 MB e ~9.400 linhas, então não cabe inteiro.

---

## 1. O que é
MMORPG 3D isométrico no navegador (PC e celular), em português, com tradução para inglês.
- 7 classes: Guerreiro, Arqueiro, Mago, Assassino, Cavaleiro Pesado, Tanque, Pierrot.
- Nível máximo 170, 124 tipos de monstros, 61 zonas e 8 calabouços.
- Também tem: World Boss, Guerra entre nações (Kharzun 🐉 vermelho × Azurath azul) na Cidade das Máquinas, Arena PK, duelo, guildas, leilão, correio, troca, mascotes, montarias, fantasias, gemas/engastes, refino +1…+10, conjuntos, diárias/semanais e uma história em atos.

## 2. Tecnologia e hospedagem
| Parte | O quê | Onde |
|---|---|---|
| Cliente | `index.html` (tudo num arquivo: HTML+CSS+JS), Babylon.js **7.54.3** fixo (CDN), loader glTF | Cloudflare Pages (build `pages-build.sh` copia `*.glb` para `dist/modelos/`) |
| Regras compartilhadas | `rules.js` — usado **pelo cliente e pelo servidor** (itens, classes, dano, monstros, zonas, migração de save) | site **e** servidor |
| Tradução | `lang_en.js` — dicionário `{"d":{"texto pt":"text en",...}}` | site |
| Servidor | Node + TypeScript (`tsx`), Colyseus (WebSocket), PostgreSQL | VPS, atualiza sozinho a partir do GitHub (`atualizar.sh`) |
| Repositório | `lucaspagodesrc-ux/MMORPG-BETA-V2`, **estrutura plana** (tudo na raiz, sem `src/`) | upload pelo site do GitHub (limite 25 MB por arquivo) |

Arquivos do servidor (raiz): `index.ts` (sobe tudo), `WorldRoom.ts` (sala do mundo, a maior), `schema.ts` (estado sincronizado), `auth.ts`, `db.ts`, `monsters.ts`, `dungeon.ts`, `pvp.ts` (duelo/arena/guerra), `worldboss.ts`, `guild.ts`, `auction.ts`, `trade.ts`, `mail.ts`, `itemutil.ts`.
Outros: `Dockerfile`, `docker-compose.yml`, `env.example`, `vps-instalar.sh`, `backup.sh`, `smoke.mjs`, `colyseus-browser.js`.

**Regra de ouro:** se mudar `rules.js`, suba no site **e** no servidor (é o mesmo arquivo na raiz; o VPS puxa do GitHub). O servidor é quem calcula dano, drop e XP; o cliente só mostra.

## 3. Mapa do `index.html` (procure pelos nomes)
- `CR` — sistema de criaturas GLB: `CR.defs` (`{f:'arquivo',sz:altura,by:'h',noPx:1,two:1,lin:1,clips:{idle,walk,atk,atk2,hit,die}}`), `CR.KEY` (monstro → criatura), `CR.TYPE`, `CR.build`, `CR.mat`, `CR.play`, `CR.anim`. Os GLB são carregados com `?v=223` no nome para furar o cache.
- `buildMonster(model,id,type)`; escala do monstro = (boss ? 1,6 : 1) × `MT[k].sc`.
- `OCT` + `scene.getActiveMeshCandidates` — árvore de seleção própria (cenário parado longe da câmera não entra no quadro).
- `PX` — "proxy" leve dos bonecos de longe; `lodAdd` — níveis de detalhe.
- `VCULL` (v2.3.3) — pausa as animações fora da tela. `?cull=0` desliga.
- `STATICQ` — congela a matriz do cenário estático.
- iPhone/celular: `IOS`/`MOB`, cenário `THIN`, monstros preguiçosos `MLAZY`/`monVis`, montarias carregadas só ao chamar.
- Efeitos: `skillFx`, `groundFx`, `ring`, `burst`, `VFX.launch`, `later(ms,fn)`, `fx[]` (lista de efeitos com `upd/done`), `GFX` (círculos no chão).
- Legibilidade em PvP (v2.3.3): `FXCTX` (de quem é o efeito), `fxLvl()`, `FXO` (⚙️ Opções → "Efeitos de outros jogadores": Auto/Todos/Reduzidos/Mínimos, salvo em `localStorage mmo_fxo`), `fxCtxOf(o)` (inimigo vermelho `#ff3b3b` / aliado azul `#3ba4ff`).
- Números flutuantes: `floatText`, `dmgFloat` (soma golpes no mesmo alvo em 0,3 s), `avoidFloat` (ícones 💨 🛡️ 🔰).
- Nomes: `plateHtml`, `place(el,pos,dy)`, `declutterPl()` (nomes empilhados não se sobrepõem), `HOVP` (nível ao passar o mouse na Guerra).
- PvP: `PKS` (`PKS.mode` = `'war'`/`'arena'`/`'duel'`/''), `foeOk(o)`, `foeOf`, `pkDmg`/`pkHit`.
- Rede: `NET.room` (Colyseus), `NET.others` (Map de jogadores), `S` (dados do personagem), `P` (jogador local).
- Habilidades: `castSkill0`/`remoteSkill0` envolvidos por `slowed()` (o Guerreiro é 40% mais lento: `SK_SLOW` no rules.js).
- Equipamento: `eqGrid` (painel Personagem), `SLOT_ORD`, `eqIco` (ícone espada+escudo do Cavaleiro, classe CSS `.ksi`), `ico(it)`.
- Modo de teste: `?dbg` expõe `window.__G` (P, S, PKS, NET, scene, buildMonster, RULES, fxT, groundFx...). Abrir o `index.html` direto do disco roda **offline** com `localStorage`.

## 4. Mapa do `rules.js`
`CLASSES`, `MT` (monstros: `n, lv, boss, sc, model, tint`), `ZONES`, `DUNGEONS`, `QUESTS`, `NPCS`, `SHOPS`, `RECIPES`, `genItem`, `slotPool`, `cleanItem`, `migrate` (conserta saves antigos ao logar), `newChar`, `stats`, `hitDamage`, `skStat`, `PVP` (`cm` = multiplicador por classe no PvP, `defMult:0`, `defDmg:0`), `pvpK`, `WAR`, `ARENA`, `DUEL`, `NATIONS`, `GEMS`, `SETB`, `PETS`, `MTS` (montarias), `FZS` (fantasias), `SK_SLOW`, `castMs`/`animMs`, `VERSION`.
Exporta tudo via `module.exports` (servidor) e `window.RULES` (cliente).

## 5. Mudanças recentes (já entregues)
- **v2.3.1–2.3.2:** Guerreiro com habilidades 40% mais lentas (animação e lançamento, cliente e `WorldRoom.ts`). Correção para iPhone: Babylon fixo em 7.54.3, menos memória, montarias sob demanda, monstros perto carregados primeiro. Balanceamento PvP (`PVP.cm`, `defMult/defDmg` em `pvp.ts`).
- **Cavaleiro:** espada e escudo viraram **um item só** (arma ganha metade da defesa/vida do escudo, `KS_SH=.5`). O slot de escudo sumiu; escudos antigos são apagados em `migrate`/`cleanItem`; receitas de escudo removidas; `mail.ts` sem escudo nos presentes astrais.
- **v2.3.3:**
  - 6 monstros novos com rig e animações feitas no Blender: `mo_ogro`, `mo_demonio`, `mo_gargula`, `mo_orc`, `mo_golem`, `mo_musgo`. Ligações principais em `CR.KEY`: golem→musgo; au_tita/au_gra/dg_fd→golem_r; vc_ifrit/vc_dem/demonio/dg_km1/dg_fm2/dg_kd/dg_kclone→demonio_v; dg_nm1/barbaro/dg_ne/yeti_rei/yeti_anciao→ogro; dg_nboss/dg_nd/golem_gelo→gargula; orc/dg_na→orc_n.
  - Esses GLB usam `lin:1` porque a textura tem que ser lida sem sRGB, senão o modelo fica preto.
  - Efeitos de outros jogadores reduzidos em PvP, aros por cor de lado, números de dano limpos, nomes sem sobreposição e animações pausadas fora da tela.
  - Ícone espada+escudo maior.

## 6. Pendências e ideias
- Avisos visuais para habilidades perigosas (sugerido, não pedido).
- O aro vermelho de perigo do Reator Ômega (monstro) pode ser confundido com o aro "inimigo" vermelho do PvP.
- Testar a v2.3.3 em iPhone real.
- O pacote de som "96 Extra SFX" **não** pode ser usado até o dono informar a fonte/licença.

## 7. Regras para quem continuar (IMPORTANTE)
1. Responder em **português do Brasil**, de forma curta e honesta.
2. **Nunca** colocar senha, token ou string de conexão no GitHub nem no código. Credenciais de GM ficam só em `/etc/mmorpg.env` no VPS. Não repetir segredos que apareçam em prints (token DuckDNS, conexão Neon). O e-mail do dono é privado.
3. Não usar assets piratas nem redistribuir pacotes de som brutos.
4. Montarias: **não reduzir triângulos** dos modelos.
5. Entregar **arquivos completos** prontos para subir pela interface web do GitHub (o dono não usa git na linha de comando). Arquivos com mais de 25 MB não sobem.
6. Toda mudança marcada com comentário no código: `/* v2.3.4: o que mudou e por quê */`.
7. Mudança de save/itens → tratar em `migrate`/`cleanItem` do `rules.js` (não há jogadores ativos ainda, mas o save tem que continuar abrindo).
8. Depois de mudar `rules.js`, ele vai para o site e para o servidor. Se mudar um `.ts`, só o servidor (o VPS atualiza sozinho em alguns minutos).
9. Ao trocar um `.glb` existente, aumentar o `?v=` da URL de carregamento para o navegador não usar a versão velha.
10. Se o jogo "não mudou" depois de subir: esperar o deploy do Cloudflare Pages (1–2 min) e recarregar sem cache (Ctrl+F5; no celular, fechar a aba).

## 8. Como pedir ajuda à outra IA (modelo)
> "Estou desenvolvendo o Valdoria Online (resumo anexo). Quero [mudança]. Segue o trecho atual de `index.html` / `rules.js` / `WorldRoom.ts` (procurei por `nomeDaFunção`). Me devolva o trecho alterado completo e diga exatamente onde colar."

Para achar um trecho no `index.html`: abra no navegador do GitHub, use **Ctrl+F** com os nomes da seção 3 e copie a função inteira.

## 9. Como colocar um modelo 3D novo (monstro)
1. **Esqueleto + animações.** Modelos do Tripo/Meshy vêm sem esqueleto. Escolha um caminho:
   - **A) Script do projeto** (`humanoid_rig.py`, para humanoides, com ou sem asas). Instale o Blender (grátis) e rode no terminal, na pasta do arquivo:
     `blender -b -P humanoid_rig.py -- entrada.glb mo_nome.glb 0 1024`
     (`0` = não reduz triângulos; `1024` = tamanho máximo da textura). Para modelo com asas, antes rode `set WINGS=1` (Windows) ou `export WINGS=1` (Mac/Linux). Para modelo pesado (golem, colosso), use `HEAVY=1`.
     O script gera as animações com os nomes que o jogo usa: Idle, Walk, Attack, Attack2, Hit, Death.
   - **B) Mixamo** (site grátis da Adobe, só humanoides): envie o modelo, baixe as animações e junte tudo num .glb no Blender. Depois renomeie as animações para os nomes acima, ou informe os nomes em `clips`.
   - **C) Ferramenta de rig do próprio Tripo/Meshy**, se tiver: baixe em .glb com as animações.
2. **Teste o .glb** em https://gltf-viewer.donmccurdy.com (arraste o arquivo): veja se anda e ataca, e se a textura aparece.
3. **Suba** o `mo_nome.glb` na raiz do repositório (até 25 MB; o ideal é menos de 5 MB para não pesar no celular).
4. **Registre no `index.html`** (procure por `musgo:{f:'mo_musgo'`) e acrescente uma linha igual:
   `nome:{f:'mo_nome',sz:2.4,by:'h',noPx:1,two:1,lin:1,clips:{idle:'Idle',walk:'Walk',atk:'Attack',atk2:'Attack2',hit:'Hit',die:'Death'}},`
   - `sz` = altura no jogo (2,3 para comum humanoide; o boss já fica 1,6× maior sozinho).
   - `lin:1` = obrigatório para modelos Tripo/Meshy (sem ele o modelo fica preto).
   - `two:1` = desenha os dois lados das faces (evita buracos).
5. **Ligue ao monstro:** em `CR.KEY` (logo abaixo, procure por `KEY:{golem:'musgo'`), acrescente `chave_do_monstro:'nome',`. As chaves dos monstros estão em `MT` no `rules.js` (ex.: `yeti_rei`, `dg_nboss`).
6. Os comuns que usam o mesmo modelo do boss já ficam menores pela escala `sc` de cada um em `MT` (no `rules.js`).
7. Recarregue com Ctrl+F5 e vá até o monstro para conferir tamanho, cor, direção e animações.

## 10. v2.3.4 — Troca de ouro por diamantes
- Janela 💎 Loja de Diamantes → aba **💱 Ouro → 💎**. Taxa fixa 💰 1.000.000 = 💎 1 (100 milhões = 100 💎), só ouro→diamante, sem volta. Máximo 💎 100 mil por troca.
- `rules.js`: `DIA_GOLD`, `DIA_XMAX`, ação `act` `t:'gold2dia', n:<quantidade>` (o servidor confere ouro, quantidade inteira e limite `DIA_MAX`).
- `index.html`: `dxMax`, `dxUpd`, `DXN`/`DXC` (confirmação em 2 cliques), aba `troca` em `renderFz`.

## 11. v2.3.5 — 7 monstros novos (lobo, lava, obsidiana, areia)
| Arquivo | Criatura (`CR.defs`) | Monstros (`CR.KEY`) |
|---|---|---|
| `mo_lobo.glb` (4 patas, `quadruped_rig.py`) | `lobo_n` | lobo, lobo_polar, dg_nc (os brancos clareiam pela cor `tint`) |
| `mo_lava.glb` | `lava` (boss) / `lava_s` (comum, maior porque o `sc` do rules é .62) | vc_colosso, dg_fboss, dg_km2 / vc_gol |
| `mo_obsid.glb` | `obsid` | colosso, dg_s1 |
| `mo_areia.glb` (sem pernas, `NOLEGS=1`) | `areia` | elemental |
| `mo_sacerd.glb` | `sacerd` | farao, dg_boss, dg_sboss, dg_sm2 |
| `mo_anubis.glb` | `anubis` | chacal, dg_c, dg_sa |
| `mo_mumia.glb` | `mumia_n` | mumia, dg_a |
- Nova opção nas criaturas: `tintAll:1` (a cor `tint` do monstro no rules.js pinta o modelo inteiro; cores bem claras clareiam).
- Scripts de esqueleto: `humanoid_rig.py` (agora com `NOLEGS=1`) e `quadruped_rig.py` (lobos, cães, felinos...). Uso igual: `blender -b -P script.py -- entrada.glb saida.glb 0 1024`.

## 12. v2.3.6 — Dano do Guerreiro e da Chuva de Adagas
- Guerreiro +60% sobre os valores antigos: Golpe Poderoso 1.2, Giro de Lâmina 2.4, Investida 2.88, Terremoto 3.52, Trovão 9.6, Fúria do Bárbaro +32% de dano (`buffs.dmg:.32`). O dano contínuo do Trovão (240/s) não mudou.
- Assassino: Chuva de Adagas 1.05 (+50%).
- Atenção: em `buffs`, `dmg` é porcentagem de bônus (.32 = +32%), não multiplicador.

## 13. v2.3.7 — Técnica de Amp. vira Ataque
- Cada 8 de Técnica de Amp. (gemas `w_ampe/w_ampm/a_ampe/a_ampm`, atributo de item de chefe e bônus de conjunto `ampX`) = **+100 de Ataque** (Espada ou Mágico, pela escola da classe). Constante `AMP_ATK = 100` no `rules.js`.
- Vale em tudo (habilidades e ataque básico). O antigo % só nas habilidades foi removido (`stats().amp` = 0; novos campos `ampPts` e `ampAtk`).
- PvP: "Resistência à Técnica Amp." (`ramp`) corta essa % do Ataque que veio da Amp. do atacante (em `hitDamage`).
- Painel do personagem: linhas "Amp. Espada/Mágica" mostram os pontos e "(+X ataque)"; o valor já entra no Ataque.

## 14. v2.3.8 — Alvo (seleção de monstros e jogadores)
- `cycleTarget()`: tecla **Z** (e o botão ⇆ no celular) troca para o próximo inimigo perto, sem repetir os já vistos nos últimos 3 s. Se estava atacando o alvo antigo, passa a atacar o novo.
- `tgtFocus()` em `castSkill0`: apertar uma habilidade sem alvo seleciona o inimigo mais perto.
- A seleção some sozinha quando o alvo morre ou fica a mais de `TGT_FAR` (30) ou além da borda da tela.
- Monstros e jogadores inimigos (`pkFoes()`): mapas PK, Arena, Guerra e futuros modos com `PKS.mode`.

## 15. v2.3.9 — Marcador no mapa, rolagem, forja de Vulcânia, Tanque fora
- **Marcador de destino:** no mapa aberto (M), clicar coloca um alfinete (`WP`, `wpFromMap`); clicar nele de novo remove. Com o mapa fechado: feixe de luz no lugar, seta no chão em volta do personagem e distância (`WPM`). Some ao chegar (< 2,5 m). Também aparece no minimapa (seta na borda quando está fora dele).
- **Rolagem:** toda `.win` rola quando passa da altura da tela; `#titlesBody` tem rolagem própria. Títulos: clicar no nome do grupo (calabouço) recolhe/mostra (salvo em `localStorage mmo_tcol`).
- **Forja de Vulcânia (Brakk):** antes abria vazia (nenhuma receita com `at:'ferreiro_lava'`). Novos materiais: escamamagma, ferraobs, nucleolava, chamaeterna, chifreinf, cinzarunica (comuns de Vulcânia, 45%) e coracaoifrit, escamavulc (chefes). 8 receitas Nv 104–130 (`l_*`). Quebrar itens Nv 100+ dá materiais de Vulcânia (`BRK_BR`).
- **Tanque:** `CLS_OFF = { tanque: 1 }` no rules.js — some da criação (cliente) e o servidor recusa (auth.ts). Personagens Tanque que já existem continuam funcionando. Para voltar: apagar `tanque: 1`.

## 16. v2.4.0 — Mascotes, montarias e fantasias mais leves
- **Mascotes:** `petLoad` prepara e compila os materiais uma vez (em segundo plano); `petMk` copia só as malhas do mascote (`predicate`), sem clonar os 40 materiais, com `quiet()`. Criar um mascote caiu de ~2 s para ~4 ms no teste. Mascotes de outros jogadores entram numa fila (1 a cada 120 ms).
- **Montarias:** `MNT.load` compila em segundo plano (`forceCompilationAsync`) e marca `MNT.rdy[id]`; a montaria de outro jogador só aparece depois de pronta, baixa uma por vez (a cada 1,5 s) e só se o jogador estiver a menos de 40 m. `MNT.make` com `quiet()`.
- **Fantasia:** a arma da classe voltou a aparecer (`reskin` refaz `glbOW/glbAW` e recria a arma); a fantasia pega emprestadas da classe as animações que não tem (Dança, Sim/Não etc.), só os giros dos ossos pelo nome.

## 17. v2.4.1 — Drops e ataque básico na Cidade das Máquinas
- **Ataque básico (monstros Nv 130+):** `R.BASIC_HI = {lv:130, mult:2, pierce:.5}`; aplicado em `WorldRoom.basic()` (×2 e ignora 50% da defesa). Antes eram 170–600 golpes por monstro; agora ~50–75 (como em Vulcânia).
- **Ingressos:** dentro do calabouço os monstros não dão mais ingresso; ao concluir, cada jogador tem `R.TIX_DG = 0.1` (≈1 a cada 10 calabouços) — `dungeon.ts` `advance()`. No mapa, `TIX_MAP_F = 0.1` multiplica `tixMob/tixBoss` de todos os calabouços (comum 0,1%, chefe 0,4%; Solara 0,03/0,15%; Máquinas 0,02/0,1%).
- **Materiais:** criação só ao quebrar equipamento (`rollLoot` já não usava `T.mats`; o chefe de mundo agora dá só ferro/essência em `worldboss.ts`). `UP_DROP`: comum ferro 8% / essência 2%; chefe 60% / 30%.

## 19. v2.4.2 — Efeitos do Estúdio no jogo (Guerreiro)
- `index.html`: módulo `SFX2` (logo depois do `VFX`) toca os pacotes do Estúdio de Efeitos. Dados do pacote ficam embutidos (`PK.guerreiro`); para outra classe, gerar com `tools/fxopt.py` (spritesheets → WebP, quadro ≤256 px, folha ≤2048 px) e `tools/fxpack.py` (JSON compacto) e colar em `PK`.
- Mesma matemática do estúdio: âncoras (mão, corpo, cabeça, chão, alvo, caminho, projétil), posição congelada no início da faixa, deslocamento local (ou de mundo no modo "não mudar"), plano, pivô, esticar, giros, modos de virar (tela/iso/3D/espelho), dano em área copiado em cada monstro dentro do raio. Faixas com mais de 1,5 s em corpo/alvo acompanham quem recebeu (buffs, lentidão).
- Lançamento local (`castSkill0`) e remoto (`remoteSkill0`). Sem "manter efeitos do jogo": some o brilho de lançamento (`VFX.launch`) e aros/explosões/chão antigos perto de quem lançou e do alvo (`SFX2.sup` em `ring`, `burst`, `groundFx`, raio do Trovão). Em Guerra/Arena/duelo o aro colorido do lado continua.
- Servidor `index.ts`: rota `/fx/:f` (`fx_*.webp` na mesma pasta, cache 7 dias). As texturas da classe do jogador carregam sozinhas ao entrar.
- 16 arquivos `fx_*.webp` do Guerreiro (~2,8 MB).
- v2.4.2b: o site é publicado pelo Cloudflare Pages, então `pages-build.sh` copia `fx_*.webp` para `dist/fx/` (sem isso as imagens davam erro e apareciam quadriculados vermelho/preto). Se uma imagem não carregar, o efeito novo não aparece e a habilidade volta aos efeitos antigos.

## 20. v2.4.3 — Efeitos em spritesheet em todas as classes, pets e montarias
- Biblioteca: GIFs da pasta de spritesheets do usuário. `tools/recipes.py` (receitas por habilidade) + `tools/fxbuild.py` (GIF → `sx_*.webp`: recorta a área usada, até 24–30 quadros, quadro ≤160 px (círculos grandes ≤208), folha ≤2048 px; tira quadros "flash" pretos). 120 folhas, ~10 MB no total; cada jogador só baixa as da sua classe + estados (e as de outra classe quando ela aparece).
- `index.html`: módulo `SFX2` (substitui o pacote do estúdio da v2.4.2). Dados embutidos em `const PK=/*SXPACK*/{...}`.
  - Habilidade: faixas de lançamento (mão/corpo/chão), trajeto (caminho do personagem até o alvo ou projétil — sempre apontado na tela, espelhado para a esquerda; serve para qualquer direção), área no alvo, buffs (aura que acompanha o personagem pela duração).
  - Impacto: `VFX.hit` chama `SFX2.hit` — sprite de impacto da habilidade (ou do golpe básico da classe) em cada monstro atingido + crítico + estados (lentidão, gelo, atordoado, prisão de gelo, dano contínuo por elemento, marca), um por tipo, acompanhando o monstro e renovando a duração.
  - Marcações antigas desligadas nas habilidades com efeito: `castSkill0`/`remoteSkill0` marcam `FXCTX.sx` e `ring`, `burst`, `groundFx`, raio do Trovão, brasão do Hell Crasher e pedras do `quakeFx` não aparecem (em Guerra/Arena/duelo o aro do lado continua). Objetos das habilidades (flechas, adagas, escudo, bomba, estrela, clones, meteoros 3D) continuam.
  - Montaria: círculo de invocação durante a chamada (4 s), fumaça + poeira ao montar (também outros jogadores), poeira ao descer e poeira da corrida. Mascotes: fumaça ao aparecer e corações de vez em quando parados.
  - Peças reaproveitadas (pool por folha), limite de sprites ao mesmo tempo (60 no iPhone/modo leve, 130 no resto), outros jogadores respeitam ⚙️ efeitos mínimos.
- `pages-build.sh`: copia `fx_*.webp` e `sx_*.webp` para `dist/fx/`. Os `fx_*.webp` da v2.4.2 não são mais usados (podem ser apagados do repositório).

## 21. v2.4.4 — Arqueiro: Chuva de Flechas e Flecha Trovejante
- "Tempestade de Flechas" (habilidade 6) virou **Flecha Trovejante** ⚡ (`rules.js`: `bolt:1` no lugar de `arr:2`, cor #9fd8ff; mesmo dano, raio 5,2, recarga 18 s). Uma flecha carregada de raios voa até o alvo e explode em área após 0,42 s (`castSkill0`/`remoteSkill0`: ramo `s.bolt`). Nada cai do céu.
- Sprites do Arqueiro refeitos: Chuva de Flechas usa a saraivada `arrow-volley` (arco do arqueiro até a área) + poeira; Flecha Trovejante usa carga na mão, rastro, bola elétrica voando (`ft` = tempo de voo fixo do projétil), coluna de raio, explosão elétrica e onda no chão. Nenhuma das duas usa mais `anime-sword-rain` (espadas).
- `lang_en.js`: "Thunder Arrow".
- Este pacote leva junto os arquivos da v2.4.1 que ainda não tinham subido (`WorldRoom.ts`, `dungeon.ts`, `worldboss.ts`; o `rules.js` já é o da v2.4.1).

## 22. v2.5.0 — Bots lançados pelo GM
- `bots.ts` (novo): `BOTS` (gerenciador) + um "cérebro" por bot. Cada personagem da conta GM lança 1 esquadrão de 6 bots (as 6 classes ativas; até 6 esquadrões = 36 bots). Mensagem `bot` {op:'on'|'off'|'st'} só para personagem GM; resposta `botst`. Somem sozinhos 2 h depois (ou quando o GM retira); se o servidor reiniciar, não voltam sozinhos.
- Cada bot é uma conta própria `#bot_<id do personagem GM>_<classe>` (o `#` não é aceito no cadastro, e a senha é aleatória: ninguém entra nelas). O personagem fica salvo e continua evoluindo nas próximas vezes. Nomes de personagens de filmes de fantasia e ficção — Senhor dos Anéis, Matrix, Star Wars, Duna, Blade Runner, Avatar, Exterminador, Alien, Mad Max (lista `NAMES`; `BANNED` = nomes proibidos, ex.: "Caio Rocha"). Bot que já existia com nome fora da lista ganha um nome novo ao ser lançado (mantém nível e itens). Se o nome já for de um jogador, usa variação ("Aragorn II"). Visual sorteado.
- Entram no mundo como jogadores comuns, por WebSocket local (`ws` sem compressão), com `join` (nunca criam outra sala). O servidor valida tudo igual a um jogador.
- O cérebro faz o papel do cliente: vida/mana (dano dos monstros com a mesma conta do cliente, regeneração, poções), morte/renascer, caça em zonas do seu nível (sem chefes), habilidades + ataque básico, junta o que cai, distribui atributos e pontos de habilidade, troca equipamento quando o novo deixa o personagem mais forte (`power` = dano × crítico × velocidade + defesa + vida), vende o que não presta, anuncia raros+ no leilão, compra poções, aceita e entrega missões, compra/engasta gemas e aprimora a arma quando sobra ouro, jura lealdade a uma nação no Nv 50 (por esquadrão: 3 em Kharzun e 3 em Azurath), muda de mapa pelos portais quando o nível libera, entra na Arena PK de vez em quando e na Cidade das Máquinas (Nv 130 com nação), aceita duelo só se a diferença de nível for de até 10%. Não usam chat nem calabouços.
- `rules.js`: `R.inTown` mais rápido (mesma regra) — é chamado para cada monstro a cada passo.
- Painel do GM (`index.html`): seção 🤖 Bots com Lançar / Retirar e a lista dos bots (nome, classe, nível, nação) e o tempo que falta.
- Custo medido com 36 bots: ~30% de um núcleo do processador (simulação dos monstros + sincronização).

## 23. XP técnica (v2.5.2)
- Pontos de habilidade agora vêm de duas fontes: +1 por nível (como antes) e +1 a cada 100% de **XP técnica**.
- Cada golpe de **habilidade** que acerta um monstro ou o fantoche (espantalho) soma `R.TXP_HIT` = 0,5%. Ataque básico, clones e baús não contam.
- Servidor: `WorldRoom.techXp` (chamado em `hit()`), guarda em `c.txp`; envia `txp` ao cliente (throttle 400 ms) e, ao fechar 100%, dá `c.sp`+1 com toast/log/som.
- Cliente: barra roxa fina abaixo da barra de XP (`#txFill`/`#txText`, `txHud()`), texto explicativo na janela de habilidades (K).
- Testado: 6 básicos = 0; 12 habilidades no fantoche = +6%; 98,5% → 100% virou +1 ponto e sobrou o resto; valor fica salvo.

## 24. Nível máximo 200 (v2.5.3)
- `MAX_LEVEL` 170 → **200** (`rules.js`). Os GMs são reconstruídos no nível 200 no próximo login (`ensureGm` em `auth.ts`).
- `gainXp` agora para no 200: não sobe além, a XP fica zerada e não acumula mais. `flushXp` (servidor) nem envia XP para quem está no 200.
- HUD: no 200 a barra de XP fica cheia com "NÍVEL MÁXIMO" / "MAX LEVEL".
- A XP técnica continua valendo no 200 (pontos de habilidade).

## 25. Calabouços sem monstros nas etapas finais (v2.5.4)
- Causa: cada instância tem 189 slots de monstro (id = inst*200+slot) e os slots nunca voltavam. Etapas que criam monstros sem parar (escolta, lasers, geradores, âncoras) esgotavam os slots e as etapas seguintes (ondas, defender, aliados/escudo de chefe) não criavam mais nada.
- Afetava: Núcleo da Forja-Mãe (etapas 6, 8, 9 e mecânicas dos chefes), Fábrica de Ferrugem (7 ondas, 9 escolta), Abismo do Vazio e Caldeira do Dragão (6 defender). Cripta, Santuário, Cidadela e Fornalha não chegavam ao limite.
- Correção (`dungeon.ts`): `spawnLazy` reaproveita o slot do monstro morto há mais tempo (≥3 s), nunca o de baú; `monsters.ts` ganhou `removeOne`; o servidor força o cliente a receber o monstro novo completo (`mv.delete`).
- Teste: simulação das etapas de todos os calabouços (3 jogadores, etapas longas) — antes 0 monstros nessas etapas, agora todas criam monstros.

## 26. Painel do GM: Bots no topo (v2.5.5)
- A seção 🤖 Bots ficava no fim do Painel do GM (✨ / tecla Y), escondida pela rolagem. Agora é a primeira seção do painel.

## 27. Cidadãos removidos (v2.5.6)
- Os cidadãos que andavam pelas cidades (Aurora, Solara, Nevasca, Vulcânia) foram removidos do cliente. Guardas de patrulha e animais continuam; os guardas vão virar imagens paradas (impostores) quando as artes ficarem prontas.

## 28. NPCs em imagem (v2.6.0)
- 33 NPCs trocaram o boneco 3D por uma imagem (gerada pelo usuário no Gemini, fundo verde/magenta removido por chroma key + despill, recortada). Atlas único `npc_atlas_1.webp` (2048×1024, 465 KB; 157 px por unidade); `NPCIMG` no index.html guarda [x,y,w,h, largura, altura no mundo, pescoço] por id. Ferramentas: scratchpad `npcimg/key.py` (recorte) e `atlas.py` (atlas + mapa nome do arquivo → id). Para trocar uma arte: gerar de novo o atlas com outro número (npc_atlas_2.webp) e atualizar NPCIMG.
- Cliente: `nimpBuild()` junta todos num só mesh (1 chamada de desenho) virado para a câmera fixa (eixos tirados da view matrix), grade 3×10 por NPC; `nimpAnim()` faz respiração e cabeça balançando/olhando (só NPCs a <40 do jogador), e escurece junto com o clima da região (hemi/sun). Sombra: disco antigo + silhueta projetada no chão (1 mesh, alfa .36).
- Clique: plano invisível (visibility 0) do tamanho da figura com metadata do NPC — missões e janelas iguais. NPCs em imagem não entram no LOD.
- Servidor: rota /modelos aceita .png/.webp; pages-build copia npc_atlas_*.webp.
- Medido (praça de Aurora, renderizador por software): triângulos dos NPCs no mapa 254.862 → 27.182; malhas ativas 244 → 111; chamadas de desenho 298 → 164; quadro 16 → ~10,5 ms.
- Faltam imagens de 37 NPCs (continuam 3D) e dos baús. Piscar de olhos não feito (precisaria marcar os olhos em cada imagem).

## 29. Bots escalonados e NPCs maiores (v2.6.1)
- Bots: ao lançar, entra 1 bot na hora e os outros 5 um a cada 5 minutos (ordem das classes embaralhada; `GAP_MS`, 20 s com BOT_TEST). Cada bot sai 2 h depois da própria entrada (`Bot.until`). "Retirar" cancela os que ainda iam entrar e tira todos na hora. Status (`botst`) ganhou `pend` e `next`; o painel mostra "X a caminho (próximo em N min)".
- NPCs em imagem 22% maiores (largura/altura no mundo em NPCIMG ×1,22; o atlas não mudou).
- Testado: bots entrando de 20 em 20 s no modo teste, retirar zerou tudo e nenhum entrou depois.

## 30. Bots fazem missões de verdade (v2.6.2)
- Antes: o bot caçava o spot de maior nível (não o alvo da missão) e só aceitava/entregava missões no mapa atual durante o "passeio na cidade" — ficava preso na 1ª missão (gosmas), que trava a corrente.
- Agora (`questWork` / `chooseZone` em bots.ts, a cada 4 s): 1) entrega qualquer missão concluída (vai até o NPC, em qualquer mapa liberado); 2) com menos de 2 missões em andamento, aceita novas — primeiro no mapa atual, depois nos outros mapas que o nível libera (Solara 50, Nevasca 75, Vulcânia 100, Máquinas 130 + nação), as de nível menor primeiro, até 3 do mesmo NPC; 3) caça no spot do alvo da missão (o menos cheio) e prefere esse tipo de monstro; 4) sem missão possível: spot de maior XP (`R.xpFor` × nº de monstros); se já tem 2+ jogadores/bots nele, vai para o próximo de menos XP, e assim por diante (reavalia a cada 20 s).
- Ignora missões de chefe, de calabouço (alvo sem spot) e com alvo muito acima (>Nv+3) ou muito abaixo (<Nv−22). Desiste de uma missão depois de 4 tentativas falhas (zera a cada 15 min).
- Teste (6 bots novos, 7 min, BOT_TEST): todos chegaram ao Nv 10–11 com 12–15 missões entregues.

## 31. Painel do GM: aba Online (v2.6.3)
- O Painel do GM (✨ / Y) agora tem duas abas: "🤖 Bots e Buff" (o que já existia) e "👥 Online".
- Online: lista todos os personagens conectados (classe, nível, região ou calabouço, nação, morto), com selo BOT (e de qual GM) e selo GM; filtros Todos/Jogadores/Bots; atualiza a cada 10 s enquanto a aba está aberta (botão 🔄 para na hora).
- Servidor: `bot` com `op:"who"` (só GM) → `gmwho {L:[{n,c,l,r,nt,gm,b,o,d}]}`. Bot = conta `#bot_…`; dono via `BOTS.ownerOf(charId)`.

## 32. Bots voltam depois de queda/atualização (v2.6.4)
- Tabela `bot_squads(gm, data, at)`: cada esquadrão guarda o plano `[{c (classe), i (posição/nação), at (hora de entrada)}]`. Salvo ao lançar, a cada entrada/saída de bot; apagado ao Retirar ou quando todos acabam o tempo.
- Ao subir o servidor (`BOTS.restore()`, 4 s depois do listen): recoloca cada esquadrão — bots que já estavam no jogo entram de novo (1,5–3,5 s entre eles) com o tempo que ainda tinham (saem em at + 2 h); os que ainda iam entrar seguem o horário original. O 1º bot usa joinOrCreate se a sala ainda não existir.
- Conexão de um bot caiu com o servidor no ar: tenta voltar até 6 vezes (5 s, 10 s, 15 s...) antes de desistir.
- Testado: 2 no jogo + 4 a caminho → servidor derrubado e religado → os 2 voltaram, os 4 continuaram entrando (6/6); Retirar apagou o registro.

## 33. Mundo único, praia e 2 calabouços novos (v3.0.0)
- **Mapa único** feito da imagem de referência (vulcão NO, neve NE, deserto SO, máquinas L, verde no centro, mar e porto ao sul): andável x −500..440, z −370..350 (antes eram 5 mapas de 160 m). Calabouços (x 450..1650) e Arena PK (x > 1650) continuam separados.
- **Grade de 2 m** (470×360) em `rules.js` → `WORLD` (RLE base64): bioma (1 Aurora, 2 Solara, 3 Nevasca, 4 Vulcânia, 5 Máquinas, 6 Praia, 7 mar) + bit 8 "andável". `regAt`, `walk`, `cityAt`, `cityOf`, `BR` (pontes). Muros, casas, árvores e pedras marcam células sólidas — a MESMA grade vale para cliente, servidor e bots.
- **Cidades** (`WORLD.CITY`): Aurora (0,0) 58 m, Vulcânia (−274,206), Nevasca (300,170), Solara (−360,−150), Máquinas (318,−96, sem zona segura), Vila da Maré (−118,−250, cerca). Muro quadrado com portões nos 4 cantos (chanfro de 8 m), torres, guardas nos portões. Aurora tem castelo (PreviewOnly do kit, escala .38) e os portais para as outras cidades; cada cidade tem portal de volta. Zona segura = quadrado dentro do muro.
- **Andar é livre** (sem bloqueio de nível por região). Login migra posições antigas (`c.wv<3`) para a cidade da região.
- **Gerado offline** (scripts no scratchpad `world/`): `gen1-4` biomas/rios/relevo/caminhos (A* com ruído + Chaikin)/pontes → `world_1.png` (R altura, G bioma×16, B marcas: 1 caminho, 2 ponte, 4 rio, 8 lava, 16 lago, 32 mar); `place.py` posições de NPCs/zonas/chefes; `gen5.py` muros, casas, barcos, rebanhos e ~6.650 objetos espalhados por bioma + grade final (`rle5.txt`); `gen6.py` `mapa_1.webp`; `gen7.py` separa `world_1.json` (objetos) do bloco `WLDD` embutido no index; `apply.py` copia tudo para o repositório.
- **Objetos parados viraram imagem**: 86 modelos dos pacotes renderizados no Blender (câmera ortográfica 35,6°/45°, igual à do jogo) → atlas `props_1.webp` (2048², 308 KB) + `PROPIMG`. Cliente (`wProps`) junta as imagens em blocos de 64 m (1 malha por bloco), com sombra deitada no chão e luz dia/noite. Descartados: árvores com textura faltando (rosa), salgueiro 2, caixote.
- **Terreno** (`wTerrain`): blocos 40×40 da `world_1.png`, material com plugin `WSplat` (mistura 8 texturas pintadas por vértice: grama, areia, neve, vulcão, máquinas, praia, rocha, caminho). Plano de mar enorme logo abaixo do chão (sem borda preta; fundo da cena cor de mar). Lava e gelo em faixas. Pontes de madeira. Piso de pedra nas cidades.
- **Muros/torres/castelo**: `castelo_kit.glb` (kit enviado, com permissão) carregado uma vez; cada peça vira instâncias (thin instances não desenhavam; e instância precisa `rotationQuaternion=null` para girar).
- **Colisão**: `wClamp` (desliza na grade) no lugar do `clampMap` antigo; clique no chão usa A* (`WNAV`/`wSteer`) para contornar rios, morros e muros. `nav.ts` (servidor/bots) ganhou lista de fechados (antes travava em alguns caminhos longos).
- **Mapas**: minimapa = recorte do `mapa_1.webp` centrado no jogador, norte para cima (com seta). **M** = mapa-múndi, **Tab** = mapa da região (caixa das células andáveis da região). Marcador de destino funciona no mundo todo.
- **Cor do nome do monstro** pela diferença de nível: ≥ +10 preto, +4..+9 vermelho, −3..+3 laranja, −9..−4 amarelo, ≤ −10 branco (`mobLvCol`).
- **Praia (Nv 170+)**: 8 zonas de monstros na areia (caranguejo, pirata, serpente, sapo-recife, golem de coral, sacerdotisa, 2 chefes), barcos na beira, Vila da Maré com cerca, NPCs novos (chefe da vila, pescador, mercadora, ferreiro, guardiã) e 13 missões (mrc1–7, mrp1–6).
- **Calabouços novos**: Naufrágio do Leviatã (Nv 172, tema `ship`: maré que alaga — subir nas plataformas, 5 sinos acende-apaga, conchas da memória, redemoinho do chefe) e Gruta das Marés (Nv 186, tema `reef`: espelhos que desviam o raio até o olho, placas de pressão que precisam ficar acesas juntas, conchas, maré no chefe final). Cliente: objetos `bell/shell/mirror/beamsrc/beamtgt/plate`, água da maré animada, raio em tubo, mensagens `tide/tidehit/whirl/mem/shell/bell/mirror`.
- Modelos dos monstros novos: sapo → `frog`, golem → `golem_r`, sacerdotisa/sereia/medusa → `sacerd`, enguia/leviatã/kraken → `snake2`.
- `cenario.glb` (SCEN) desligado no mundo. Rota `/modelos` aceita .json; `pages-build.sh` copia `world_*`, `props_*`, `mapa_*` e o kit.
- Testado (servidor local + Playwright): todas as cidades, gates, castelo, praia, Vulcânia, campos, mapa-múndi/região; montagem dos 2 calabouços novos sem erros; A* do servidor acha caminho de Aurora até todas as cidades e zonas (75/75); `tsc` sem erros.

## 34. Bots só entram na Arena PK com jogador de verdade lá dentro (v3.0.1)
- `bots.ts`: `humanInArena()` (alguém com x > 1650, fora de instância, que não seja bot — `BOTS.isBotSid`). O bot só vai à arena se houver jogador; se o último jogador sair, os bots saem depois de 30 s (`noHumanAt`). O limite de 3–7 min por visita continua.

## 35. Ajustes do mundo (v3.0.2)
- **Casas cortadas**: a imagem de pé (virada para a câmera) passava por baixo do chão na parte da frente. Agora a borda de baixo de cada imagem é empurrada na direção da câmera (`CD`, em `wProps`) — na tela nada muda, mas não some mais no chão.
- **Pontes** refeitas no `gen5.py`: para cada grupo de células de ponte, testa ângulos ±50° em volta do caminho e escolhe a travessia mais curta de margem a margem (11 pontes, 6–15 m). Só a faixa da ponte (3 m) é andável sobre a água. `WORLD.BR` atualizado; cliente desenha com +1 m.
- **Campos de treino**: Solara, Nevasca e Vulcânia estavam empilhados com o de Aurora; agora ficam fora do muro da própria cidade (zonas 19, 29, 42). Objetos não nascem dentro deles. Ferreiro da Maré afastado do portal.
- **Aurora**: castelo retirado; NPCs espalhados (1,75× a distância da praça), portais em fila no norte (z 46), 38 casas pela cidade toda.
- **Retorno (B)** e renascer: `sp` das cidades = centro (Aurora: ao sul do chafariz, 6,−15).
- **GM**: clique no mapa-múndi/região = teletransporte (servidor joga para o ponto andável mais perto se cair em água/muro).
- Conferência automática: nenhum NPC fora do chão nem colado; nenhuma zona sobreposta ou encostada em cidade; zonas com nível coerente com a região; A* acha caminho para todas as cidades e zonas.
