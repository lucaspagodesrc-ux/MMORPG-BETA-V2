/* =====================================================================
   rules.js — REGRAS DO JOGO (compartilhadas entre o servidor e o navegador)

   Tudo o que vale dinheiro/progresso (XP, ouro, itens, atributos, drops, missões, loja,
   forja) é calculado AQUI. No modo online o SERVIDOR executa estas regras; o navegador
   apenas mostra o resultado. Para ajustar o equilíbrio do jogo, mexa neste arquivo.
   ===================================================================== */
(function (root) {
'use strict';
const R = {};
const rnd = (a, b) => a + Math.random() * (b - a), ri = (a, b) => Math.floor(rnd(a, b + 1)), pick = a => a[Math.floor(Math.random() * a.length)];

/* ---------- BALANCEAMENTO (versão 0.8) ---------- */
const PTS_PER_LEVEL = 3;                    // pontos de atributo por nível (antes: 5)
const GOLD_CAP_PER_LEVEL = 3000;            // teto de ouro aceito ao migrar personagens antigos
const MAX_LEVEL = 100;
const xpNeed = l => Math.floor(24 * Math.pow(l, 2.3));   // XP para sair do nível l (antes: 50·l^1.45)
R.PTS_PER_LEVEL = PTS_PER_LEVEL; R.MAX_LEVEL = MAX_LEVEL; R.xpNeed = xpNeed; R.VERSION = 4;

const RAR=[{n:'Comum',c:'#c9d1d9',m:1},{n:'Incomum',c:'#5fd068',m:1.2},{n:'Raro',c:'#4aa3ff',m:1.45},{n:'Épico',c:'#c77dff',m:1.8}];
const SLOTS={shield:'Escudo',weapon:'Arma',helmet:'Elmo',armor:'Armadura',boots:'Botas',ring:'Anel',bracelet:'Bracelete',earring:'Brinco',cape:'Capa'};
const STN={str:'Força',agi:'Agilidade',int:'Inteligência',vit:'Vitalidade'};
const WN={assassino:['Adaga Curta','Adaga de Ferro','Adaga de Aço','Lâmina Rúnica','Adaga do Eclipse','Adaga Abissal','Adaga Dracônica'],cavaleiro:['Espada Curta','Espada Longa','Espada de Cavaleiro','Espada Rúnica','Lâmina do Guardião','Espada Abissal','Espada Dracônica'],guerreiro:['Montante Enferrujado','Montante de Ferro','Montante de Aço','Montante Rúnico','Montante Lendário','Montante Abissal','Montante Dracônico'],arqueiro:['Arco Curto','Arco de Caça','Arco Composto','Arco Rúnico','Arco do Vento','Arco Abissal','Arco Dracônico'],mago:['Cajado de Madeira','Cajado de Cristal','Cajado Arcano','Cajado Rúnico','Cajado Estelar','Cajado Abissal','Cajado Dracônico']};
const AN=['Túnica Simples','Couraça de Couro','Cota de Malha','Armadura de Placas','Armadura Rúnica','Armadura Abissal','Armadura Dracônica'];
const HN=['Capuz de Pano','Elmo de Couro','Elmo de Ferro','Elmo de Aço','Elmo Rúnico','Elmo Abissal','Elmo Dracônico'];
const BN=['Sandálias','Botas de Couro','Botas de Ferro','Botas de Aço','Botas Rúnicas','Botas Abissais','Botas Dracônicas'];
const RN=['Anel de Cobre','Anel de Prata','Anel de Ouro','Anel de Rubi','Anel Rúnico','Anel Abissal','Anel Dracônico'];
const CPN=['Capa de Pano','Capa de Viajante','Capa de Couro','Capa de Combate','Capa Rúnica','Capa Abissal','Capa Dracônica'],CMN=['Estola de Linho','Estola de Seda','Estola Encantada','Estola Arcana','Estola Rúnica','Estola Abissal','Estola Dracônica'];
const CAN=['Manto de Pano','Manto de Viajante','Manto de Couro','Manto Sombrio','Manto Rúnico','Manto Abissal','Manto Dracônico'],XCA=['Manto Solar','Manto Faraônico','Manto Imortal'];
const XCP=['Capa Solar','Capa Faraônica','Capa Imortal'],XCM=['Estola Solar','Estola Faraônica','Estola Imortal'];
const BRN=['Pulseira de Couro','Bracelete de Cobre','Bracelete de Prata','Bracelete de Ouro','Bracelete Rúnico','Bracelete Abissal','Bracelete Dracônico'];
const ERN=['Brinco de Osso','Brinco de Cobre','Brinco de Prata','Brinco de Ouro','Brinco Rúnico','Brinco Abissal','Brinco Dracônico'];
WN.tanque=['Gancho Enferrujado','Gancho de Ferro','Gancho de Aço','Corrente Rúnica','Gancho do Guardião','Gancho Abissal','Gancho Dracônico'];
WN.pierrot=['Florete de Brinquedo','Florete de Ferro','Florete de Aço','Florete Rúnico','Florete do Arlequim','Florete Abissal','Florete Dracônico'];
const SHN=['Escudo de Madeira','Escudo de Ferro','Escudo de Aço','Escudo Rúnico','Escudo do Guardião','Escudo Abissal','Escudo Dracônico'];
const XN={weapon:{tanque:['Gancho Solar','Gancho Faraônico','Gancho Imortal'],pierrot:['Florete Solar','Florete Faraônico','Florete Imortal'],assassino:['Adaga Solar','Adaga Faraônica','Adaga Imortal'],cavaleiro:['Espada Solar','Espada Faraônica','Espada Imortal'],guerreiro:['Montante Solar','Montante Faraônico','Montante Imortal'],arqueiro:['Arco Solar','Arco Faraônico','Arco Imortal'],mago:['Cajado Solar','Cajado Faraônico','Cajado Imortal']},
 armor:['Armadura Solar','Armadura Faraônica','Armadura Imortal'],helmet:['Elmo Solar','Elmo Faraônico','Elmo Imortal'],boots:['Botas Solares','Botas Faraônicas','Botas Imortais'],ring:['Anel Solar','Anel Faraônico','Anel Imortal'],bracelet:['Bracelete Solar','Bracelete Faraônico','Bracelete Imortal'],earring:['Brinco Solar','Brinco Faraônico','Brinco Imortal'],shield:['Escudo Solar','Escudo Faraônico','Escudo Imortal']};
const SUF=['do Dragão','da Tempestade','da Sombra','do Titã','da Aurora','do Lobo'];
const MATS={gosma:{n:'Gosma Viscosa',i:'🟢',v:2},couro:{n:'Couro de Lobo',i:'🟤',v:4},ferro:{n:'Minério de Ferro',i:'⛏️',v:6},osso:{n:'Osso Antigo',i:'🦴',v:8},essencia:{n:'Essência Arcana',i:'✨',v:20},erva:{n:'Erva Verde',i:'🌿',v:3},nucleo:{n:'Núcleo de Golem',i:'💠',v:150},
 seda:{n:'Seda de Aranha',i:'🕸️',v:12},presa:{n:'Presa de Orc',i:'🦷',v:18},cristal:{n:'Cristal de Gelo',i:'🧊',v:25},brasa:{n:'Brasa Infernal',i:'🔥',v:35},escama:{n:'Escama de Dragão',i:'🐉',v:300},
 ferrao:{n:'Ferrão de Escorpião',i:'🦂',v:60},linho:{n:'Linho Amaldiçoado',i:'🧻',v:90},veneno:{n:'Glândula de Naja',i:'🐍',v:120},cristalsol:{n:'Cristal do Deserto',i:'🔶',v:160},garra:{n:'Garra de Chacal',i:'🐾',v:200},ankh:{n:'Ankh Sagrado',i:'☥',v:260},obsidiana:{n:'Obsidiana Negra',i:'⬛',v:700},selo:{n:'Selo do Faraó',i:'🔱',v:1200}};
const POTS={hp:{n:'Poção de Vida',i:'🧪',v:12,pct:.4,d:'Recupera 40% da vida'},mp:{n:'Poção de Mana',i:'🔷',v:12,pct:.4,d:'Recupera 40% da mana'},
 hp2:{n:'Poção de Vida Superior',i:'🍷',v:45,pct:.7,d:'Recupera 70% da vida'},mp2:{n:'Poção de Mana Superior',i:'💧',v:45,pct:.7,d:'Recupera 70% da mana'}};
const MAXRANK=20;

/* Habilidades: lv = nível para aprender; ranks 1–20. Até o rank 5 o ganho é maior (+20% dano, +6% mana, -4% recarga por rank); depois cresce mais devagar. */
const CLASSES={
 guerreiro:{n:'Guerreiro',i:'⚔️',wi:'⚔️',main:'str',base:{str:10,agi:5,int:2,vit:9},range:2.8,ranged:false,
  d:'Combate corpo a corpo com montante (espada grande, sem escudo). Muita vida e dano em área.',
  skills:[
   {n:'Golpe Poderoso',i:'💥',lv:1,cd:3,mp:8,type:'single',mult:2.2,range:3.2,color:'#ffcf6b',d:'Ataque forte contra um alvo.'},
   {n:'Giro de Lâmina',i:'🌀',lv:3,cd:6,mp:14,type:'aoeSelf',mult:1.5,radius:3.6,color:'#ffd27a',d:'Golpeia todos ao redor.'},
   {n:'Investida',i:'⚡',lv:5,cd:8,mp:12,type:'dash',mult:1.8,range:10,color:'#8fd3ff',d:'Avança até o alvo e ataca.'},
   {n:'Grito de Guerra',i:'📣',lv:8,cd:25,mp:20,type:'buff',buffs:{dmg:.35,shield:.15},dur:12,color:'#ff9f5a',d:'+35% dano e -15% dano recebido.'},
   {n:'Terremoto',i:'🌋',lv:12,cd:12,mp:28,type:'aoeSelf',mult:2.2,radius:5,slow:3000,color:'#c9a56b',d:'Abala o chão: dano em área e lentidão.'},
   {n:'Sangue de Guerra',i:'🩸',lv:15,cd:30,mp:25,type:'heal',pct:.35,color:'#ff6b6b',d:'Recupera 35% da vida máxima.'},
   {n:'Fúria Berserker',i:'😡',lv:20,cd:40,mp:35,type:'buff',buffs:{dmg:.6,haste:.3},dur:12,color:'#ff5a3a',d:'+60% dano e +30% velocidade.'},
   {n:'Execução',i:'🗡️',lv:25,cd:20,mp:40,type:'single',mult:6,range:3.4,color:'#ffe9a8',d:'Golpe devastador contra um alvo.'}]},
 arqueiro:{n:'Arqueiro',i:'🏹',wi:'🏹',main:'agi',base:{str:4,agi:11,int:3,vit:6},range:9.5,ranged:true,proj:'arrow',pcol:'#e8e0b0',
  d:'Ataque à distância. Crítico alto e mobilidade.',
  skills:[
   {n:'Tiro Preciso',i:'🎯',lv:1,cd:3,mp:8,type:'single',mult:2.3,range:11,proj:'arrow',color:'#fff2a8',d:'Disparo certeiro em um alvo.'},
   {n:'Chuva de Flechas',i:'🌧️',lv:3,cd:7,mp:16,type:'aoeTarget',mult:1.3,radius:3.4,range:11,color:'#e8e0b0',d:'Chuva de flechas na área do alvo.'},
   {n:'Salto Evasivo',i:'🦘',lv:5,cd:8,mp:10,type:'dashBack',dist:7,buffs:{haste:.5},dur:4,color:'#9fe7b0',d:'Salta para trás e ganha rapidez.'},
   {n:'Foco Mortal',i:'👁️',lv:8,cd:22,mp:18,type:'buff',buffs:{crit:.35,dmg:.2},dur:10,color:'#ff7a7a',d:'+35% crítico e +20% dano.'},
   {n:'Tiro Triplo',i:'🏹',lv:12,cd:9,mp:24,type:'multi',hits:3,mult:1.2,range:11,proj:'arrow',color:'#fff2a8',d:'Três flechas seguidas no alvo.'},
   {n:'Flecha Gélida',i:'🧊',lv:15,cd:10,mp:22,type:'single',mult:2.8,range:11,proj:'arrow',slow:4000,color:'#8fe3ff',d:'Flecha congelante que retarda o alvo.'},
   {n:'Tempestade de Flechas',i:'⛈️',lv:20,cd:18,mp:40,type:'aoeTarget',mult:2.3,radius:5.2,range:11,color:'#e8e0b0',d:'Uma tempestade de flechas em grande área.'},
   {n:'Tiro Letal',i:'☠️',lv:25,cd:22,mp:45,type:'single',mult:6.5,range:13,proj:'arrow',color:'#ff7a7a',d:'Disparo mortal de altíssimo dano.'}]},
 mago:{n:'Mago',i:'🪄',wi:'🪄',main:'int',base:{str:2,agi:4,int:11,vit:5},range:9,ranged:true,proj:'orb',pcol:'#9fc4ff',
  d:'Magia devastadora. Frágil, mas com enorme dano.',
  skills:[
   {n:'Bola de Fogo',i:'🔥',lv:1,cd:3,mp:10,type:'single',mult:2.4,range:10.5,proj:'big',color:'#ff8a3d',d:'Esfera flamejante em um alvo.'},
   {n:'Nova Gélida',i:'❄️',lv:3,cd:8,mp:18,type:'aoeSelf',mult:1.4,radius:4.2,slow:3500,color:'#8fe3ff',d:'Explosão de gelo que retarda inimigos.'},
   {n:'Escudo Arcano',i:'🔮',lv:5,cd:24,mp:20,type:'buff',buffs:{shield:.5},dur:10,color:'#c79bff',d:'Reduz 50% do dano recebido.'},
   {n:'Meteoro',i:'☄️',lv:8,cd:18,mp:45,type:'aoeTarget',meteor:true,mult:3.4,radius:4,range:11,color:'#ff6a2a',d:'Um meteoro devastador na área.'},
   {n:'Raio Arcano',i:'⚡',lv:12,cd:8,mp:26,type:'multi',hits:4,mult:1.0,range:10.5,proj:'orb',color:'#9fc4ff',d:'Quatro descargas arcanas no alvo.'},
   {n:'Cura Arcana',i:'💚',lv:15,cd:28,mp:30,type:'heal',pct:.4,color:'#6fdc7f',d:'Recupera 40% da vida máxima.'},
   {n:'Tempestade de Gelo',i:'🌨️',lv:20,cd:16,mp:50,type:'aoeTarget',mult:2.4,radius:5.5,range:11,slow:3500,color:'#8fe3ff',d:'Nevasca em grande área que retarda inimigos.'},
   {n:'Apocalipse',i:'🌠',lv:25,cd:40,mp:90,type:'aoeTarget',meteor:true,mult:7,radius:6.5,range:12,color:'#ff3a2a',d:'Chuva de fogo apocalíptica.'}]},
 assassino:{n:'Assassino',i:'🥷',wi:'🔪',main:'agi',base:{str:4,agi:12,int:4,vit:5},range:2.4,ranged:false,combo:true,
  d:'Lâminas e sombras. +30% vel. de ataque, +12% crítico, -10% vida. Encadeie habilidades em COMBOS: bônus de dano, mana de volta e recargas reiniciadas.',
  skills:[
   {n:'Corte Rápido',i:'🔪',lv:1,cd:2.5,mp:6,type:'single',mult:2.0,range:3.4,color:'#c79bff',after:[1,3],cbonus:.4,d:'Corte veloz. COMBO após Passo Sombrio ou Dança das Lâminas.'},
   {n:'Passo Sombrio',i:'💨',lv:3,cd:7,mp:12,type:'dash',mult:1.2,range:10,color:'#8f7aff',d:'Teleporta até o alvo e ataca. Abertura de combo.'},
   {n:'Chuva de Adagas',i:'🗡️',lv:5,cd:8,mp:16,type:'multi',hits:4,mult:.7,range:8,proj:'arrow',color:'#e0c4ff',after:[1,0],cbonus:.5,d:'Arremessa adagas em sequência. COMBO após Passo Sombrio ou Corte Rápido.'},
   {n:'Dança das Lâminas',i:'🌪️',lv:8,cd:9,mp:18,type:'aoeSelf',mult:1.6,radius:3.8,color:'#ff7ad9',after:[0,1,2],cbonus:.6,reset:[1],d:'Giro de lâminas em área. COMBO reinicia o Passo Sombrio.'},
   {n:'Marca da Morte',i:'🎯',lv:12,cd:14,mp:20,type:'single',mult:1.0,range:9,proj:'arrow',mark:6,color:'#ff4a6a',after:[3],cbonus:.3,d:'Marca o alvo: +35% de dano recebido por 6s.'},
   {n:'Véu Sombrio',i:'🌑',lv:15,cd:30,mp:25,type:'buff',buffs:{evade:.35,crit:.3,haste:.3},dur:8,color:'#7a6aff',d:'+35% esquiva, +30% crítico e +30% velocidade.'},
   {n:'Execução Rápida',i:'⚡',lv:20,cd:12,mp:30,type:'single',mult:3.0,range:3.4,exec:true,color:'#ffd24a',after:[4,3],cbonus:.8,reset:[1,4],d:'Dano dobrado em alvos com menos de 40% de vida. COMBO reinicia Passo Sombrio e Marca.'},
   {n:'Tempestade Sombria',i:'☠️',lv:25,cd:40,mp:60,type:'barrage',hits:6,mult:1.1,range:11,color:'#c79bff',d:'Teleporta e desfere uma rajada de golpes. Ao final, ZERA as recargas de todas as outras habilidades.'}]},
 cavaleiro:{n:'Cavaleiro Pesado',i:'🛡️',wi:'🗡️',main:'str',base:{str:8,agi:3,int:3,vit:13},range:2.6,ranged:false,
  d:'Espada e escudo. Defesa +40% e vida +15%. Converte defesa em dano.',
  skills:[
   {n:'Golpe de Escudo',i:'🛡️',lv:1,cd:3,mp:8,type:'single',mult:1.2,defMult:1.0,range:3.2,anim:'shield',color:'#9fc4ff',d:'Golpe com o escudo: o braço do escudo bate no alvo. Dano + parte da sua DEFESA.'},
   {n:'Investida do Escudo',i:'🐂',lv:3,cd:8,mp:12,type:'dash',mult:1.2,defMult:.8,range:10,color:'#8fd3ff',d:'Avança com o escudo e converte defesa em dano.'},
   {n:'Postura Defensiva',i:'🏰',lv:5,cd:60,cdMin:35,mp:18,type:'buff',buffs:{shield:.35},dur:60,fixDur:1,color:'#7fa6d9',d:'Auto-buff (só em você) por 1 minuto: -35% de dano recebido. Recarga: 60s no rank 1 até 35s no rank máximo.'},
   {n:'Bastião',i:'⚙️',lv:8,cd:120,cdMin:90,mp:25,type:'buff',buffs:{defdmg:.6,defloss:.6},fixBuff:1,dur:60,fixDur:1,color:'#ffd27a',d:'Auto-buff por 1 minuto: converte 60% da sua DEFESA em força (a defesa cai 60% e todo ataque ganha esse valor como dano). Recarga: 120s no rank 1 até 90s no máximo.'},
   {n:'Impacto Sísmico',i:'💢',lv:12,cd:12,mp:28,type:'aoeSelf',mult:.8,defMult:1.5,radius:4.5,slow:3000,anim:'jump',delay:650,color:'#c9a56b',d:'Salta bem alto e bate com o escudo no chão: dano em área baseado na DEFESA.'},
   {n:'Vontade de Ferro',i:'🩹',lv:15,cd:60,cdMin:60,mp:25,type:'heal',pct:.3,color:'#6fdc7f',d:'Recupera 30% da vida máxima.'},
   {n:'Escudo Voador',i:'🥏',lv:20,cd:24,mp:40,type:'shieldThrow',mult:1.3,defMult:1.0,range:12,pierce:.5,anim:'throw',color:'#9fd0ff',d:'Arremessa o escudo para frente, ferindo (perfurante) todos que acertar. No alcance máximo ele gira por 2s causando dano em área e depois volta para você. Sem escudo enquanto ele voa.'},
   {n:'Raio do Escudo',i:'🔆',lv:25,cd:22,mp:45,type:'shieldBeam',mult:.9,defMult:1.6,range:15,pierce:.5,dur:3,anim:'beam',color:'#fff2a8',d:'Bate a espada no escudo e solta um raio por 3s à frente, causando dano perfurante em tudo que ele atravessa.'}]},
 tanque:{n:'Tanque',i:'⛓️',wi:'🔨',main:'vit',base:{str:6,agi:2,int:2,vit:14},range:2.8,ranged:false,
  d:'O mais resistente: DEFESA +75%, vida +30%. Puxa, atordoa, imobiliza, levanta e PROVOCA os monstros para levar o dano.',
  skills:[
   {n:'Gancho de Corrente',i:'⛓️',lv:1,cd:7,mp:10,type:'single',mult:.9,defMult:.7,range:10,proj:'hook',pull:true,stun:1200,color:'#9fb4c8',d:'Arremessa o gancho, PUXA o alvo até você e o atordoa.'},
   {n:'Pisão Sísmico',i:'🦶',lv:3,cd:9,mp:14,type:'aoeSelf',mult:.5,defMult:1,radius:4,stun:1000,color:'#c9a56b',d:'Pisa com força: dano em área baseado na DEFESA e ATORDOA os inimigos.'},
   {n:'Provocar',i:'📢',lv:5,cd:16,mp:16,type:'taunt',radius:9,buffs:{shield:.35},dur:8,color:'#ff7a5a',d:'Provoca todos ao redor: eles passam a te focar. -35% de dano recebido.'},
   {n:'Correntes de Aço',i:'🔗',lv:8,cd:13,mp:22,type:'aoeTarget',mult:.6,defMult:.8,radius:4,range:10,root:3500,color:'#8fb0d0',d:'Prende os inimigos da área no chão: IMOBILIZADOS.'},
   {n:'Golpe Ascendente',i:'⏫',lv:12,cd:15,mp:28,type:'aoeSelf',mult:.8,defMult:1.3,radius:4.5,lift:1600,color:'#ffd27a',d:'Lança os inimigos para o alto: LEVANTADOS e atordoados.'},
   {n:'Muralha de Ferro',i:'🧱',lv:15,cd:40,mp:30,type:'buff',buffs:{shield:.5,defdmg:.3},dur:12,color:'#7fa6d9',d:'-50% de dano recebido e 30% da DEFESA vira dano.'},
   {n:'Campo de Atração',i:'🌀',lv:20,cd:24,mp:35,type:'aoeSelf',mult:.6,defMult:1,radius:9,pull:true,root:2500,color:'#a78bfa',d:'PUXA todos os inimigos próximos para perto de você e os imobiliza.'},
   {n:'Sentença do Colosso',i:'🗿',lv:25,cd:40,mp:55,type:'aoeSelf',mult:1.4,defMult:3,radius:5.5,stun:2500,lift:2000,color:'#fff2a8',d:'Pancada colossal: dano enorme baseado na DEFESA, atordoa e levanta tudo ao redor.'}]},
 pierrot:{n:'Pierrot',i:'🤡',wi:'🤺',main:'agi',base:{str:3,agi:12,int:4,vit:4},range:2.6,ranged:false,
  d:'Palhaço acrobata: frágil, mas com CRÍTICO alto e muita SORTE (mais raros, slots e épicos +0~+4). Giros, estocadas e CLONES.',
  skills:[
   {n:'Estocada',i:'🤺',lv:1,cd:2.5,mp:6,type:'single',mult:2.1,range:3.4,color:'#ff6b9a',d:'Estocada veloz de florete.'},
   {n:'Pirueta Giratória',i:'🌀',lv:3,cd:6,mp:14,type:'aoeSelf',mult:1.5,radius:3.6,color:'#ff9ad0',d:'Gira golpeando todos ao redor.'},
   {n:'Passo de Bailarino',i:'💃',lv:5,cd:8,mp:12,type:'dash',mult:1.6,range:10,color:'#ffd27a',d:'Desliza até o alvo e o atravessa com uma estocada.'},
   {n:'Truque da Sorte',i:'🍀',lv:8,cd:30,mp:20,type:'buff',buffs:{crit:.3,luck:.6},dur:15,color:'#6fdc7f',d:'+30% crítico e +60% de SORTE nos drops por 15s.'},
   {n:'Estocada Tripla',i:'⚔️',lv:12,cd:8,mp:22,type:'multi',hits:3,mult:1.15,range:3.6,color:'#ff6b9a',d:'Três estocadas seguidas no alvo.'},
   {n:'Clones Ilusórios',i:'👥',lv:15,cd:30,mp:30,type:'clone',cloneMult:.25,dur:15,color:'#c79bff',d:'Cria clones que atacam junto com você. +1 clone a cada 4 ranks (rank 1, 5, 9, 13, 17).'},
   {n:'Redemoinho Circense',i:'🎪',lv:20,cd:16,mp:38,type:'aoeMulti',hits:4,mult:.95,radius:4.4,color:'#ff4a8a',d:'Um furacão de lâminas: vários giros em sequência.'},
   {n:'Grand Finale',i:'🎭',lv:25,cd:24,mp:45,type:'single',mult:6.5,range:3.6,forceCrit:true,color:'#ffe28a',d:'Golpe final teatral: CRÍTICO garantido.'}]}
};
/* Elemento visual de cada habilidade (efeitos no chão, partículas): wind, fire, ice, water, lightning, earth, poison, shadow, holy, blood, steel, arcane, nature, circus */
const SKFX={guerreiro:['steel','wind','wind','fire','earth','blood','fire','steel'],arqueiro:['wind','water','wind','fire','wind','ice','lightning','shadow'],
 mago:['fire','ice','arcane','fire','lightning','nature','ice','fire'],assassino:['shadow','shadow','steel','wind','blood','shadow','lightning','shadow'],
 cavaleiro:['steel','earth','holy','holy','earth','nature','holy','holy'],tanque:['steel','earth','fire','steel','earth','steel','shadow','earth'],
 pierrot:['circus','wind','circus','nature','circus','arcane','wind','circus']};
for(const k in SKFX)CLASSES[k].skills.forEach((s,i)=>{s.fx=SKFX[k][i];});
const MT={
 slime:{n:'Gosma da Floresta',lv:[1,3],hp:45,atk:6,def:0,spd:1.5,xp:10,gold:[1,4],aggro:6,rng:1.7,atkInt:1700,resp:10,leash:15,h:1.7,mats:{gosma:0.510,erva:0.212,essencia:0.025},eq:0.042,pot:0.048},
 lobo:{n:'Lobo Cinzento',lv:[4,6],hp:110,atk:11,def:4,spd:3.2,xp:60,gold:[4,8],aggro:8,rng:1.9,atkInt:1300,resp:12,leash:18,h:1.8,mats:{couro:0.468,erva:0.170,essencia:0.043},eq:0.060,pot:0.048},
 goblin:{n:'Goblin Saqueador',lv:[7,9],hp:200,atk:18,def:10,spd:2.9,xp:138,gold:[7,17],aggro:8,rng:1.8,atkInt:1400,resp:13,leash:18,h:2.4,mats:{ferro:0.425,couro:0.212,essencia:0.060},eq:0.084,pot:0.060},
 esqueleto:{n:'Esqueleto Amaldiçoado',lv:[10,12],hp:330,atk:28,def:18,spd:2.6,xp:236,gold:[15,33],aggro:8,rng:1.9,atkInt:1500,resp:14,leash:18,h:2.6,mats:{osso:0.468,ferro:0.255,essencia:0.085},eq:0.108,pot:0.060},
 golem:{n:'Golem Ancião',lv:[15,15],hp:3200,atk:62,def:35,spd:2.0,xp:4259,gold:[180,300],aggro:9,rng:3.0,atkInt:1800,resp:150,leash:20,h:5.2,boss:true,mats:{nucleo:1,ferro:1,essencia:1},matMax:3,eq:1,pot:1,rb:3},
 aranha:{n:'Aranha Gigante',lv:[13,15],hp:520,atk:40,def:24,spd:3.4,xp:347,gold:[24,54],aggro:8,rng:1.9,atkInt:1200,resp:14,leash:18,h:2.0,mats:{seda:0.468,osso:0.170,essencia:0.102},eq:0.120,pot:0.060},
 orc:{n:'Orc Guerreiro',lv:[16,18],hp:900,atk:58,def:34,spd:2.9,xp:470,gold:[42,84],aggro:8,rng:2.1,atkInt:1500,resp:15,leash:18,h:3.2,mats:{presa:0.425,ferro:0.340,essencia:0.119},eq:0.132,pot:0.060},
 yeti:{n:'Yeti das Montanhas',lv:[19,21],hp:1500,atk:80,def:45,spd:2.8,xp:603,gold:[72,132],aggro:8,rng:2.4,atkInt:1600,resp:16,leash:18,h:3.6,mats:{cristal:0.425,couro:0.255,essencia:0.128},eq:0.144,pot:0.060},
 demonio:{n:'Demônio Flamejante',lv:[22,24],hp:2300,atk:110,def:60,spd:3.2,xp:744,gold:[120,216],aggro:9,rng:2.2,atkInt:1400,resp:18,leash:20,h:3.4,mats:{brasa:0.425,osso:0.255,essencia:0.170},eq:0.156,pot:0.072},
 dragao:{n:'Dragão Rubro',lv:[28,28],hp:14000,atk:190,def:90,spd:2.6,xp:20452,gold:[1200,1800],aggro:10,rng:4.6,atkInt:1800,resp:400,leash:24,h:8,boss:true,mats:{escama:1,brasa:1,essencia:1},matMax:3,eq:1,pot:1,rb:3},
 // ===== Solara (deserto) — níveis 50 a 75 =====
 escorpiao:{n:'Escorpião Gigante',lv:[50,53],hp:2800,atk:330,def:70,spd:3.3,xp:4414,gold:[228,390],aggro:8,rng:2.0,atkInt:1300,resp:14,leash:18,h:2.4,mats:{ferrao:0.468,linho:0.170,essencia:0.170},eq:0.132,pot:0.060},
 mumia:{n:'Múmia Ancestral',lv:[54,57],hp:3400,atk:370,def:85,spd:2.5,xp:4774,gold:[288,492],aggro:8,rng:2.0,atkInt:1500,resp:14,leash:18,h:3.2,mats:{linho:0.468,ankh:0.128,essencia:0.187},eq:0.138,pot:0.060},
 cobra:{n:'Naja Dourada',lv:[58,61],hp:3600,atk:420,def:80,spd:3.8,xp:5143,gold:[360,600],aggro:9,rng:2.2,atkInt:1200,resp:14,leash:18,h:3.0,mats:{veneno:0.468,cristalsol:0.170,essencia:0.212},eq:0.144,pot:0.060},
 elemental:{n:'Elemental de Areia',lv:[62,65],hp:4600,atk:450,def:110,spd:2.9,xp:5521,gold:[450,750],aggro:8,rng:2.4,atkInt:1500,resp:15,leash:18,h:3.6,mats:{cristalsol:0.425,veneno:0.170,essencia:0.238},eq:0.150,pot:0.060},
 chacal:{n:'Guardião Chacal',lv:[66,69],hp:5400,atk:500,def:120,spd:3.1,xp:5906,gold:[540,900],aggro:9,rng:2.3,atkInt:1400,resp:16,leash:20,h:3.6,mats:{garra:0.425,ankh:0.212,essencia:0.255},eq:0.156,pot:0.060},
 sacerdote:{n:'Sacerdote Profano',lv:[70,73],hp:6200,atk:540,def:130,spd:2.8,xp:6299,gold:[660,1080],aggro:10,rng:5.5,atkInt:1700,resp:16,leash:20,h:3.8,mats:{ankh:0.425,garra:0.170,essencia:0.297},eq:0.168,pot:0.072},
 colosso:{n:'Colosso de Obsidiana',lv:[65,65],hp:48000,atk:700,def:150,spd:2.2,xp:124159,gold:[5400,8400],aggro:10,rng:3.6,atkInt:1800,resp:300,leash:22,h:6.4,boss:true,mats:{obsidiana:1,ankh:1,essencia:1},matMax:3,eq:1,pot:1,rb:3},
 farao:{n:'Faraó Imortal',lv:[75,75],hp:110000,atk:900,def:175,spd:2.4,xp:197202,gold:[12000,18000],aggro:11,rng:5.0,atkInt:1800,resp:500,leash:26,h:7.4,boss:true,mats:{selo:1,obsidiana:1,essencia:1},matMax:3,eq:1,pot:1,rb:3}
};

/* ====================== DUNGEONS ======================
   Cada dungeon é um corredor reto (de z=-72 a z=+79). O servidor cria uma instância por grupo. */
const dgMob=(base,o)=>Object.assign({}, MT[base], {model:base,dg:true,resp:0,eq:.02,pot:.02,mats:{}}, o);
Object.assign(MT, {
  dg_a: dgMob('mumia',    {n:'Guardião da Cripta',   lv:[52,54], hp:6100, atk:460, def:94,  xp:6200, gold:[430,740],  aggro:9, leash:30}),
  dg_b: dgMob('escorpiao',{n:'Escorpião Sombrio',    lv:[53,55], hp:5200, atk:420, def:78,  xp:5900, gold:[400,700],  aggro:9, leash:30}),
  dg_c: dgMob('chacal',   {n:'Sentinela Chacal',     lv:[55,57], hp:9000, atk:560, def:128, xp:7800, gold:[600,1000], aggro:9, leash:30}),
  dg_d: dgMob('cobra',    {n:'Naja Amaldiçoada',     lv:[56,58], hp:6600, atk:520, def:90,  xp:7000, gold:[560,940],  aggro:10, leash:30}),
  dg_s1:dgMob('colosso',  {n:'Sentinela de Obsidiana',lv:[56,56],hp:70000,atk:720, def:150, xp:34000,gold:[6000,9000],aggro:11,leash:40,boss:true,rng:3.6,atkInt:1800}),
  dg_s2:dgMob('sacerdote',{n:'Escriba Sombrio',      lv:[57,57], hp:96000,atk:760, def:140, xp:42000,gold:[7000,10000],aggro:11,leash:40,boss:true,rng:5,atkInt:1700}),
  dg_boss:dgMob('farao',  {n:'Faraó Devorador',      lv:[58,58], hp:190000,atk:980,def:175, xp:68000,gold:[12000,18000],aggro:12,leash:45,boss:true,rng:5,atkInt:1700}),
  dg_chest:{n:'Baú da Cripta',lv:[1,1],hp:30,atk:0,def:0,spd:0,xp:0,gold:[0,0],aggro:0,rng:0,atkInt:999999,resp:0,leash:0,h:1.4,mats:{},eq:0,pot:0,chest:true,model:'chest',dg:true},
});
const DUNGEONS=[{
  id:'cripta', name:'Cripta das Areias Esquecidas', icon:'🏺', minLevel:50, price:50000, time:2400, ilvl:[52,58], cx:600, grace:300,
  desc:'Um corredor de tumbas habitado por guardiões amaldiçoados. 2 sub-chefes, 1 chefe final e 3 baús de tesouro. Itens com SLOTS caem aqui. Tempo limite: 40 min.',
  start:{x:600,z:-72}, exitZ:78,
  titles:{1:'Desbravador da Cripta',10:'Saqueador de Tumbas',50:'Senhor das Areias Eternas',100:'Lenda da Cripta Esquecida'},
  gates:[-46,-22,-2,24,46,60,79],            // z máximo permitido em cada etapa (o portão abre ao concluir a etapa)
  stages:[
    {k:'kill',t:'dg_a',need:20,text:'Elimine os Guardiões da Cripta',spawn:{t:'dg_a',n:26,z:[-68,-50]}},
    {k:'statue',id:'st1',z:-43,t:'dg_b',need:14,text:'Fale com a Estátua da Oferenda',spawn:{t:'dg_b',n:18,z:[-40,-26]},
      name:'Estátua da Oferenda',ask:'"Viajante... o deserto exige uma oferenda. Derrame o sangue de 14 escorpiões sombrios e o portão se abrirá."',
      wait:'"A oferenda ainda não está completa..."',fin:'"A areia aceita sua oferenda. Siga em frente."'},
    {k:'boss',t:'dg_s1',text:'Derrote a Sentinela de Obsidiana',spawn:{t:'dg_s1',n:1,z:[-11,-11]},chest:{slot:100,tier:1}},
    {k:'kill',t:'dg_c',need:24,text:'Elimine as Sentinelas Chacal',spawn:{t:'dg_c',n:30,z:[3,20]}},
    {k:'statue',id:'st2',z:26,t:'dg_d',need:14,text:'Fale com a Estátua do Juramento',spawn:{t:'dg_d',n:18,z:[30,42]},
      name:'Estátua do Juramento',ask:'"Quem deseja o trono do Faraó deve provar seu valor. Silencie 14 najas amaldiçoadas."',
      wait:'"Ainda ouço o sibilar das najas..."',fin:'"Seu juramento foi aceito. O Escriba aguarda."'},
    {k:'boss',t:'dg_s2',text:'Derrote o Escriba Sombrio',spawn:{t:'dg_s2',n:1,z:[53,53]},chest:{slot:101,tier:2}},
    {k:'boss',t:'dg_boss',final:true,text:'Derrote o Faraó Devorador',spawn:{t:'dg_boss',n:1,z:[70,70]},chest:{slot:102,tier:3}}
  ]
}];

/* ---------- ORIGEM DOS ITENS: cada item dropado carrega a "marca" do monstro que o soltou ----------
   sf = sufixo do nome • col/col2 = cores • el = elemento dos efeitos (+7 em diante) • ft = traço visual (chifres, presas...) */
const OG={
 slime:{sf:'da Gosma',col:'#6fdc7f',col2:'#2f8f4a',el:'poison',ft:'blob'},
 lobo:{sf:'do Lobo',col:'#aab4c0',col2:'#6b7480',el:'lightning',ft:'ears'},
 goblin:{sf:'do Goblin',col:'#8fbf3f',col2:'#5a7a2a',el:'gold',ft:'ears'},
 esqueleto:{sf:'do Esqueleto',col:'#e8e4d0',col2:'#a8a38c',el:'soul',ft:'skull'},
 golem:{sf:'do Golem',col:'#a08c78',col2:'#6a5a4a',el:'fire',ft:'rock'},
 aranha:{sf:'da Aranha',col:'#8a4fc0',col2:'#3a2358',el:'shadow',ft:'eyes'},
 orc:{sf:'do Orc',col:'#6fa04a',col2:'#3f5f2a',el:'poison',ft:'tusks'},
 yeti:{sf:'do Yeti',col:'#cfeaff',col2:'#7fb6e0',el:'ice',ft:'fur'},
 demonio:{sf:'do Demônio',col:'#ff6a3a',col2:'#a02a1a',el:'fire',ft:'horns'},
 dragao:{sf:'do Dragão',col:'#e0402f',col2:'#7a1f1a',el:'fire',ft:'spikes'},
 escorpiao:{sf:'do Escorpião',col:'#c8922f',col2:'#6a4a1a',el:'poison',ft:'stinger'},
 mumia:{sf:'da Múmia',col:'#d8c8a0',col2:'#8a7a58',el:'soul',ft:'wraps'},
 cobra:{sf:'da Naja',col:'#6fd08a',col2:'#2a6a44',el:'poison',ft:'hood'},
 elemental:{sf:'do Elemental',col:'#e8c070',col2:'#a07a30',el:'lightning',ft:'crystals'},
 chacal:{sf:'do Chacal',col:'#d4a62a',col2:'#6a521a',el:'gold',ft:'ears'},
 sacerdote:{sf:'do Sacerdote',col:'#9a5ad8',col2:'#3a1f6a',el:'shadow',ft:'crown'},
 colosso:{sf:'do Colosso',col:'#4a4f66',col2:'#1f2233',el:'lightning',ft:'rock'},
 farao:{sf:'do Faraó',col:'#ffd24a',col2:'#b8860b',el:'gold',ft:'crown'}
};
OG.dg_a=OG.mumia;OG.dg_b=OG.escorpiao;OG.dg_c=OG.chacal;OG.dg_d=OG.cobra;OG.dg_s1=OG.colosso;OG.dg_s2=OG.sacerdote;OG.dg_boss=OG.farao;
for(const k in MT)MT[k].id=k;
const DUPKEY={ring:1,bracelet:1,earring:1};
const keyBase=k=>String(k).replace(/2$/,'');
const validKey=k=>!!SLOTS[keyBase(k)]&&(k===keyBase(k)||!!DUPKEY[k.slice(0,-1)]);

const ZONES=[
 {t:'slime',x:-18,z:-10,r:8,n:10,col:'#3f7a55',name:'Pântano das Gosmas'},
 {t:'lobo',x:18,z:-20,r:9,n:10,col:'#4b5a45',name:'Floresta dos Lobos'},
 {t:'goblin',x:26,z:14,r:9,n:10,col:'#7a5f3a',name:'Acampamento Goblin'},
 {t:'esqueleto',x:-26,z:22,r:9,n:10,col:'#4a4d5a',name:'Cemitério Maldito'},
 {t:'golem',x:0,z:-37,r:3,n:1,col:'#5a2d2d',name:'Covil do Golem'},
 {t:'aranha',x:-58,z:-8,r:9,n:9,col:'#3a2f4a',name:'Gruta das Aranhas'},
 {t:'orc',x:50,z:-40,r:10,n:9,col:'#5a4a2a',name:'Fortaleza Orc'},
 {t:'yeti',x:-45,z:-58,r:10,n:9,col:'#9fb8c8',name:'Montanhas Geladas'},
 {t:'demonio',x:56,z:46,r:10,n:9,col:'#6a2a1a',name:'Terras Vulcânicas'},
 {t:'dragao',x:-62,z:60,r:4,n:1,col:'#3a1010',name:'Ninho do Dragão'},
 {t:'escorpiao',x:330,z:-20,r:9,n:10,col:'#8a6a3a',name:'Dunas dos Escorpiões'},
 {t:'mumia',x:270,z:-24,r:9,n:10,col:'#6a5a4a',name:'Tumbas Esquecidas'},
 {t:'cobra',x:255,z:22,r:10,n:10,col:'#4a6a3a',name:'Vale das Serpentes'},
 {t:'elemental',x:340,z:32,r:10,n:9,col:'#9a7a4a',name:'Tempestade de Areia'},
 {t:'chacal',x:300,z:-52,r:10,n:9,col:'#4a3a5a',name:'Ruínas dos Chacais'},
 {t:'sacerdote',x:352,z:-52,r:10,n:9,col:'#6a4a7a',name:'Templo Proibido'},
 {t:'colosso',x:242,z:-52,r:4,n:1,col:'#2a2024',name:'Cânion do Colosso'},
 {t:'farao',x:300,z:58,r:5,n:1,col:'#8a6a1a',name:'Pirâmide do Faraó'}];

const Q=(id,npc,t,d,tg,qty,rec,xp,gold,x)=>({id,npc,t,d,tg,qty,rec,rw:{xp:Math.max(20,Math.round(xpNeed(rec)*(qty===1?1:.025*qty+.05))),gold:Math.round(gold*.6),...(x||{})}});
const E=(slot,ilvl,rar)=>({eq:{slot,ilvl,rar}});
const QUESTS=[
 Q('q1','capitao','Caça às Gosmas','As gosmas estão invadindo os campos a oeste. Elimine 6 delas.','slime',6,1,120,60,{pot:{hp:3}}),
 Q('q2','capitao','Lobos Famintos','Lobos cinzentos atacam viajantes ao norte. Elimine 8.','lobo',8,4,420,150,E('weapon',5,1)),
 Q('q3','capitao','Acampamento Goblin','Goblins saqueadores acampam a leste. Elimine 10.','goblin',10,7,1000,320,E('armor',8,2)),
 Q('q4','capitao','Cemitério Maldito','Os mortos se levantam no cemitério. Destrua 10 esqueletos.','esqueleto',10,10,2200,650,E('ring',11,2)),
 Q('q5','capitao','O Golem Ancião','Uma antiga criatura desperta no covil ao norte. Derrote-a!','golem',1,14,6000,2000,{...E('weapon',15,3),sp:1}),
 Q('q6','capitao','A Praga das Aranhas','Aranhas gigantes tomaram a gruta a oeste. Elimine 10.','aranha',10,13,3500,1200,E('helmet',14,2)),
 Q('q7','capitao','Fortaleza Orc','Orcs se reúnem a nordeste. Derrote 10 guerreiros.','orc',10,16,5500,2000,E('armor',17,2)),
 Q('q8','capitao','Terror das Montanhas','Yetis descem das montanhas geladas. Elimine 10.','yeti',10,19,9500,3200,E('boots',20,2)),
 Q('q9','capitao','Fogo do Inferno','Demônios surgem nas terras vulcânicas. Destrua 10.','demonio',10,22,16000,5000,E('ring',23,3)),
 Q('q10','capitao','O Dragão Rubro','A lenda desperta no extremo sudoeste. Mate o Dragão Rubro!','dragao',1,27,30000,20000,{...E('weapon',28,3),sp:2}),
 Q('e1','elda','Ervas Contaminadas','As gosmas estragam minhas ervas! Elimine 10.','slime',10,1,200,80,{pot:{hp:5}}),
 Q('e2','elda','Praga Verde','Ainda há muitas gosmas no pântano. Elimine 20.','slime',20,3,400,200,E('boots',4,1)),
 Q('l1','lyra','Patrulha da Floresta','Ajude a manter os lobos longe da trilha. Elimine 12.','lobo',12,4,500,220,{pot:{hp:4}}),
 Q('l2','lyra','Alcateia Alfa','A alcateia está crescendo. Elimine 20 lobos.','lobo',20,6,850,400,E('weapon',7,2)),
 Q('b1','brum','Reforço no Front','Goblins ameaçam a estrada leste. Elimine 12.','goblin',12,7,1000,400,E('helmet',8,1)),
 Q('b2','brum','Limpeza do Acampamento','Termine o serviço: 20 goblins.','goblin',20,9,1700,800,E('weapon',10,2)),
 Q('a1','anselmo','Descanso Eterno','Dê paz às almas inquietas. Destrua 12 esqueletos.','esqueleto',12,10,1900,700,E('armor',11,2)),
 Q('a2','anselmo','A Última Bênção','Mais 20 esqueletos precisam ser purificados.','esqueleto',20,12,3200,1400,{sp:1}),
 Q('k1','kira','Teias Perigosas','Os caminhos estão cobertos de teias. Elimine 12 aranhas.','aranha',12,13,4000,1500,E('boots',14,2)),
 Q('k2','kira','Ninho de Veneno','Destrua 20 aranhas no coração da gruta.','aranha',20,15,7000,2800,E('ring',16,2)),
 Q('t1','torg','Honra Orc','Prove seu valor contra 12 orcs rivais.','orc',12,16,6500,2400,E('weapon',17,2)),
 Q('t2','torg','Guerra de Clãs','Elimine 20 orcs e ganhe o respeito do clã.','orc',20,18,11000,4500,{...E('armor',19,2),sp:1}),
 Q('y1','yuki','Silêncio na Neve','Os yetis perturbam a meditação. Elimine 12.','yeti',12,19,11000,3500,E('helmet',20,2)),
 Q('y2','yuki','Avalanche Viva','Mais 20 yetis ameaçam o vale.','yeti',20,21,18000,6000,E('ring',22,3)),
 Q('v1','vulkan','Estudo das Chamas','Preciso de brasas frescas. Derrote 12 demônios.','demonio',12,22,18000,6000,E('weapon',23,3)),
 Q('v2','vulkan','Contenção Infernal','Impeça a invasão: 20 demônios.','demonio',20,24,30000,10000,{sp:2}),
 Q('o1','orion','Guardas do Ninho','Os demônios cercam o ninho. Elimine 15.','demonio',15,24,23000,8000,E('armor',25,3)),
 Q('o2','orion','Escamas Reluzentes','Traga a cabeça do Dragão Rubro para a ciência.','dragao',1,27,20000,12000,{...E('helmet',27,3),sp:1}),
 // ===== Solara =====
 Q('s1','khalid','Dunas Mortais','Escorpiões gigantes cercam o oásis. Elimine 10.','escorpiao',10,50,3500,6000,E('weapon',51,3)),
 Q('s2','khalid','Tumbas Profanadas','Múmias despertaram nas tumbas a oeste. Destrua 12.','mumia',12,54,4500,9000,E('armor',55,3)),
 Q('s3','khalid','Veneno nas Areias','Najas douradas infestam o vale. Elimine 12.','cobra',12,58,5500,12000,E('helmet',59,3)),
 Q('s4','khalid','Fúria da Tempestade','Elementais de areia varrem o deserto. Elimine 12.','elemental',12,62,6500,16000,{...E('boots',63,3),sp:1}),
 Q('s5','khalid','O Colosso de Obsidiana','Uma criatura de pedra negra desperta no cânion. Derrote-a!','colosso',1,65,12000,30000,{...E('weapon',66,3),sp:2}),
 Q('s6','khalid','Os Guardiões de Anúbis','Os chacais protegem ruínas sagradas. Elimine 14.','chacal',14,66,7500,22000,E('ring',67,3)),
 Q('s7','khalid','O Templo Proibido','Sacerdotes profanos realizam rituais. Elimine 14.','sacerdote',14,70,9500,30000,{...E('armor',71,3),sp:1}),
 Q('s8','khalid','O Faraó Imortal','O rei maldito acorda na grande pirâmide. Derrote-o!','farao',1,74,22000,70000,{...E('weapon',75,3),sp:3}),
 Q('n1','nadir','Ferrões Valiosos','Preciso de ferrões frescos. Elimine 20 escorpiões.','escorpiao',20,50,4500,8000,{pot:{hp:10}}),
 Q('n2','nadir','Rainha das Dunas','A ninhada não para. Elimine mais 30.','escorpiao',30,52,7000,14000,E('ring',54,3)),
 Q('m1','neferu','Bandagens Malditas','Colete bandagens das múmias. Elimine 20.','mumia',20,54,6000,12000,E('helmet',56,3)),
 Q('m2','neferu','Sarcófagos Abertos','Feche as tumbas: elimine 30 múmias.','mumia',30,56,9000,19000,{sp:1}),
 Q('z1','zafira','Presas Venenosas','Preciso de veneno fresco. Elimine 20 najas.','cobra',20,58,7500,15000,E('boots',60,3)),
 Q('z2','zafira','Ninho das Najas','Destrua o ninho: elimine 30 najas.','cobra',30,60,10500,22000,E('weapon',61,3)),
 Q('i1','ibrahim','Redemoinhos Vivos','As tempestades têm vida! Elimine 20 elementais.','elemental',20,62,9000,20000,E('armor',63,3)),
 Q('i2','ibrahim','Olho da Tempestade','Acalme o deserto: elimine 30 elementais.','elemental',30,64,12500,28000,{sp:1}),
 Q('a1','anuket','Guardiões Caídos','Liberte as almas dos chacais. Elimine 20.','chacal',20,66,10500,26000,E('ring',68,3)),
 Q('a2','anuket','Fim da Vigília','Purifique o templo: elimine 20 sacerdotes.','sacerdote',20,70,13000,36000,E('helmet',71,3)),
 Q('h1','hamid','Relíquias Perdidas','Os sacerdotes guardam relíquias. Elimine 25.','sacerdote',25,71,14500,42000,E('boots',72,3)),
 Q('h2','hamid','A Maldição Eterna','Quebre a maldição: derrote o Faraó Imortal outra vez.','farao',1,74,20000,60000,{...E('weapon',76,3),sp:2})];
const QNAME={slime:'gosmas',lobo:'lobos',goblin:'goblins',esqueleto:'esqueletos',golem:'Golem Ancião',aranha:'aranhas',orc:'orcs',yeti:'yetis',demonio:'demônios',dragao:'Dragão Rubro',escorpiao:'escorpiões',mumia:'múmias',cobra:'najas',elemental:'elementais',chacal:'chacais',sacerdote:'sacerdotes',colosso:'Colosso de Obsidiana',farao:'Faraó Imortal'};

const RECIPES=[
 {id:'pot_hp',n:'Poção de Vida ×3',icon:'🧪',d:'Cura rápida.',ing:{erva:3,gosma:1},gold:0,out:(cls)=>({k:'pot',id:'hp',n:3})},
 {id:'pot_mp',n:'Poção de Mana ×3',icon:'🔷',d:'Restaura mana.',ing:{essencia:1,erva:2,gosma:2},gold:0,out:(cls)=>({k:'pot',id:'mp',n:3})},
 {id:'arma_ferro',n:'Arma de Ferro (Nv 5)',icon:'⚒️',d:'Arma da sua classe • Incomum',ing:{ferro:6,couro:3},gold:120,out:(cls)=>genItem('weapon',5,1,cls,cls,0,'goblin')},
 {id:'botas',n:'Botas Silenciosas (Nv 6)',icon:'👢',d:'Incomum',ing:{couro:10,gosma:10},gold:100,out:(cls)=>genItem('boots',6,1,undefined,undefined,0,'lobo')},
 {id:'armadura',n:'Armadura Reforçada (Nv 6)',icon:'🥋',d:'Incomum',ing:{couro:8,ferro:3},gold:150,out:(cls)=>genItem('armor',6,1,undefined,undefined,0,'lobo')},
 {id:'elmo',n:'Elmo de Osso (Nv 10)',icon:'🪖',d:'Raro',ing:{osso:8,ferro:4},gold:260,out:(cls)=>genItem('helmet',10,2,undefined,undefined,0,'esqueleto')},
 {id:'anel',n:'Anel de Essência (Nv 9)',icon:'💍',d:'Raro',ing:{essencia:6,ferro:4},gold:300,out:(cls)=>genItem('ring',9,2,undefined,undefined,0,'slime')},
 {id:'brac1',n:'Bracelete Glacial (Nv 21)',icon:'📿',d:'Raro',ing:{cristal:8,couro:6,essencia:6},gold:1600,out:(cls)=>genItem('bracelet',21,2,undefined,undefined,0,'yeti')},
 {id:'brin1',n:'Brinco Infernal (Nv 24)',icon:'🧿',d:'Raro',ing:{brasa:8,osso:6,essencia:8},gold:2600,out:(cls)=>genItem('earring',24,2,undefined,undefined,0,'demonio')},
 {id:'runica',n:'Arma Rúnica (Nv 15)',icon:'🗡️',d:'Arma da sua classe • Épico',ing:{nucleo:3,ferro:15,essencia:8},gold:1500,out:(cls)=>genItem('weapon',15,3,cls,cls,0,'golem')},
 {id:'seda',n:'Armadura de Seda (Nv 14)',icon:'🕸️',d:'Raro',ing:{seda:10,couro:6},gold:600,out:(cls)=>genItem('armor',14,2,undefined,undefined,0,'aranha')},
 {id:'orc',n:'Anel de Presa (Nv 17)',icon:'🦷',d:'Raro',ing:{presa:8,ferro:8},gold:900,out:(cls)=>genItem('ring',17,2,undefined,undefined,0,'orc')},
 {id:'gelo',n:'Botas Geladas (Nv 20)',icon:'🧊',d:'Raro',ing:{cristal:8,couro:6},gold:1400,out:(cls)=>genItem('boots',20,2,undefined,undefined,0,'yeti')},
 {id:'infernal',n:'Arma Infernal (Nv 23)',icon:'🔥',d:'Arma da sua classe • Épico',ing:{brasa:10,cristal:5,essencia:10},gold:4000,out:(cls)=>genItem('weapon',23,3,cls,cls,0,'demonio')},
 {id:'escudo',cls:'cavaleiro',n:'Escudo de Torre (Nv 12)',icon:'🛡️',d:'Só Cavaleiro • Raro',ing:{ferro:10,osso:6},gold:500,out:(cls)=>genItem('shield',12,2,undefined,undefined,0,'golem')},
 {id:'escudo2',cls:'cavaleiro',n:'Escudo Rúnico (Nv 18)',icon:'🛡️',d:'Só Cavaleiro • Épico',ing:{nucleo:2,ferro:15,essencia:8},gold:2500,out:(cls)=>genItem('shield',18,3,undefined,undefined,0,'golem')},
 {id:'draco',n:'Arma Dracônica (Nv 28)',icon:'🐉',d:'Arma da sua classe • Épico',ing:{escama:3,brasa:8,essencia:15},gold:8000,out:(cls)=>genItem('weapon',28,3,cls,cls,0,'dragao')},
 // ===== Ferreira de Solara =====
 {id:'s_pot',at:'ferreira',n:'Poção de Vida Superior ×3',icon:'🍷',d:'Cura de 70%.',ing:{veneno:2,erva:8},gold:300,out:(cls)=>({k:'pot',id:'hp2',n:3})},
 {id:'s_arma1',at:'ferreira',n:'Arma do Deserto (Nv 52)',icon:'⚒️',d:'Arma da sua classe • Raro',ing:{ferrao:10,linho:6,essencia:12},gold:9000,out:(cls)=>genItem('weapon',52,2,cls,cls,0,'escorpiao')},
 {id:'s_arm',at:'ferreira',n:'Armadura de Linho Reforçado (Nv 55)',icon:'🥋',d:'Épico',ing:{linho:14,veneno:6,essencia:10},gold:11000,out:(cls)=>genItem('armor',55,3,undefined,undefined,0,'mumia')},
 {id:'s_elmo',at:'ferreira',n:'Elmo da Naja (Nv 59)',icon:'🪖',d:'Épico',ing:{veneno:12,cristalsol:6,essencia:12},gold:14000,out:(cls)=>genItem('helmet',59,3,undefined,undefined,0,'cobra')},
 {id:'s_botas',at:'ferreira',n:'Botas das Dunas (Nv 61)',icon:'👢',d:'Épico',ing:{cristalsol:10,linho:8,essencia:12},gold:16000,out:(cls)=>genItem('boots',61,3,undefined,undefined,0,'elemental')},
 {id:'s_anel',at:'ferreira',n:'Anel do Chacal (Nv 66)',icon:'💍',d:'Épico',ing:{garra:10,ankh:4,essencia:15},gold:24000,out:(cls)=>genItem('ring',66,3,undefined,undefined,0,'chacal')},
 {id:'s_escudo',at:'ferreira',cls:'cavaleiro',n:'Escudo de Obsidiana (Nv 63)',icon:'🛡️',d:'Só Cavaleiro • Épico',ing:{obsidiana:2,ferrao:15,essencia:15},gold:20000,out:(cls)=>genItem('shield',63,3,undefined,undefined,0,'colosso')},
 {id:'s_solar',at:'ferreira',n:'Arma Solar (Nv 67)',icon:'☀️',d:'Arma da sua classe • Épico',ing:{ankh:6,cristalsol:12,essencia:20},gold:32000,out:(cls)=>genItem('weapon',67,3,cls,cls,0,'elemental')},
 {id:'s_farao',at:'ferreira',n:'Arma Faraônica (Nv 74)',icon:'👑',d:'Arma da sua classe • Épico',ing:{selo:3,obsidiana:4,ankh:10,essencia:30},gold:80000,out:(cls)=>genItem('weapon',74,3,cls,cls,0,'farao')}];
const SHOPT=['missoes','comprar','vender'];
const NPCS=[
 {id:'ferreiro',name:'Dorn, o Ferreiro',icon:'🔨',x:-6,z:-3,col:'#8a5a3a',tabs:['forja','aprimorar'],greet:'Traga materiais e ouro e eu forjo o que precisar. Também posso aprimorar seu equipamento — mas há risco!'},
 {id:'mercador',name:'Mira, a Mercadora',icon:'💰',x:6,z:-3,col:'#c79a3b',tabs:['comprar','vender'],greet:'Poções, caixas misteriosas e compro o que você não precisar!'},
 {id:'capitao',name:'Capitão Aldric',icon:'🛡️',x:0,z:-7,col:'#3f6fb5',tabs:['missoes'],greet:'A vila precisa de heróis. Cumpra as missões principais e será recompensado.'},
 {id:'mestre',name:'Mestre Kaelen',icon:'📖',x:-4.5,z:4,col:'#6b46b5',tabs:[],greet:'',hat:'#4b2f85'},
 {id:'bau',name:'Baú do Aventureiro',icon:'📦',x:4.5,z:4,col:'#8a6a43',tabs:['bau'],greet:'Seus itens guardados aqui são compartilhados com todos os seus personagens.'},
 {id:'elda',name:'Vovó Elda',icon:'🌿',x:-14,z:2,col:'#5a8a4a',tabs:SHOPT,greet:'As gosmas estragam minha horta... e eu tenho poções para vender, querido.',hat:'#7a5a3a',camp:true},
 {id:'lyra',name:'Patrulheira Lyra',icon:'🏹',x:12,z:-13,col:'#3f7a55',tabs:SHOPT,greet:'Os lobos andam inquietos. Fique alerta!',hat:'#2f5a2c',camp:true},
 {id:'brum',name:'Sargento Brum',icon:'⚔️',x:20,z:7,col:'#8a3a3a',tabs:SHOPT,greet:'Esses goblins não têm fim. Precisamos de reforços!',hat:'#9aa7b3',camp:true},
 {id:'anselmo',name:'Padre Anselmo',icon:'✝️',x:-20,z:14,col:'#d8d0c0',tabs:SHOPT,greet:'Que as almas descansem em paz... com a sua ajuda.',hat:'#d8d0c0',camp:true},
 {id:'kira',name:'Exploradora Kira',icon:'🧭',x:-48,z:-4,col:'#8a5a9a',tabs:SHOPT,greet:'Cuidado com as teias! Quase não saí viva da gruta.',hat:'#5a3a6a',camp:true},
 {id:'torg',name:'Chefe Torg',icon:'🪓',x:42,z:-33,col:'#4a6a3a',tabs:SHOPT,greet:'Orcs respeitam força. Mostre a sua!',hat:'#5a4a2a',camp:true},
 {id:'yuki',name:'Ermitão Yuki',icon:'❄️',x:-39,z:-50,col:'#9fc4e0',tabs:SHOPT,greet:'O frio revela quem tem coragem.',hat:'#dfeaf5',camp:true},
 {id:'vulkan',name:'Mago Vulkan',icon:'🔥',x:48,z:38,col:'#b5462a',tabs:SHOPT,greet:'As chamas guardam segredos antigos...',hat:'#7a2a1a',camp:true},
 {id:'orion',name:'Sábio Orion',icon:'🔭',x:-55,z:52,col:'#3a5a9a',tabs:SHOPT,greet:'O Dragão Rubro é a maior ameaça deste reino.',hat:'#2a3a6a',camp:true},
 // ===== Solara =====
 {id:'portal_a',name:'🌀 Portal de Solara (Nv 50+)',icon:'🌀',x:14,z:56,col:'#9b7bff',tabs:[],greet:'',portal:{name:'Oásis de Solara',lvl:50,to:{x:300,z:-7}}},
 {id:'portal_b',name:'🌀 Portal para a Vila Aurora',icon:'🌀',x:300,z:-11,col:'#ffcf6b',tabs:[],greet:'',portal:{name:'Vila Aurora',lvl:0,to:{x:14,z:52}}},
 {id:'bau2',name:'Baú do Aventureiro',icon:'📦',x:304.5,z:4,col:'#8a6a43',tabs:['bau'],greet:'O mesmo baú da Vila Aurora: seus itens guardados aqui são compartilhados com todos os seus personagens.',chest:true},
 {id:'ferreira',name:'Sahra, a Ferreira Solar',icon:'🔨',x:293,z:-2,col:'#a86a3a',tabs:['forja','aprimorar'],greet:'Materiais do deserto forjam o melhor aço que você já viu. Também aprimoro equipamentos — mas há risco!',hat:'#6a3a1a',smith:true},
 {id:'mercador2',name:'Hakim, o Mercador',icon:'💰',x:307,z:-2,col:'#2f7a8a',tabs:['comprar','vender'],greet:'Poções superiores e caixas raras, direto das caravanas! Tudo mais caro, mas vale cada moeda.',hat:'#d8c9a0',shop:'solara'},
 {id:'khalid',name:'Comandante Khalid',icon:'🛡️',x:295,z:-6,col:'#a8832a',tabs:['missoes'],greet:'Solara resiste graças a heróis como você. Cumpra as missões principais do deserto.',hat:'#c9a227'},
 {id:'nadir',name:'Caçador Nadir',icon:'🦂',x:321,z:-9,col:'#8a6a3a',tabs:SHOPT,greet:'Os escorpiões ficaram enormes. Cuidado com o ferrão!',hat:'#d8c9a0',camp:true,shop:'solara'},
 {id:'neferu',name:'Escriba Neferu',icon:'📜',x:281,z:-14,col:'#6a5a8a',tabs:SHOPT,greet:'As tumbas guardam segredos... e maldições.',hat:'#3a2a5a',camp:true,shop:'solara'},
 {id:'zafira',name:'Encantadora Zafira',icon:'🐍',x:267,z:14,col:'#3f8a4a',tabs:SHOPT,greet:'As najas obedecem a quem sabe ouvir. Mas estas enlouqueceram.',hat:'#2f6a3a',camp:true,shop:'solara'},
 {id:'ibrahim',name:'Beduíno Ibrahim',icon:'🌪️',x:329,z:20,col:'#c9a45a',tabs:SHOPT,greet:'O vento tem fome. Eu vi uma tempestade andar!',hat:'#e8dcb0',camp:true,shop:'solara'},
 {id:'anuket',name:'Sacerdotisa Anuket',icon:'☥',x:322,z:-42,col:'#4a3a8a',tabs:SHOPT,greet:'Os guardiões de Anúbis já não descansam.',hat:'#d4a62a',camp:true,shop:'solara'},
 {id:'guarda_cripta',name:'Guardião das Criptas',icon:'🗝️',x:309,z:6,col:'#5a4a7a',tabs:['dungeon'],greet:'Há criptas esquecidas nos cantos mais distantes do deserto. Compre o ingresso comigo e fale com o portal da cripta. Quem tem ingresso e está no seu grupo entra junto!',hat:'#d4a62a'},
 {id:'dg_cripta',name:'🏺 Cripta das Areias (Nv 50+)',icon:'🏺',x:366,z:66,col:'#d4a62a',tabs:[],greet:'',dungeon:'cripta'},
 {id:'hamid',name:'Arqueólogo Hamid',icon:'🔭',x:300,z:44,col:'#8a6a4a',tabs:SHOPT,greet:'A grande pirâmide esconde o maior tesouro do mundo... e o maior perigo.',hat:'#a8833a',camp:true,shop:'solara'}];


/* ====================== FUNÇÕES DE REGRA ====================== */
const MON_TOWN_R = 11;
R.TOWN_R = MON_TOWN_R;
R.TOWNS = [{ x: 0, z: 0, r: 11 }, { x: 300, z: 0, r: 13 }];   // zonas seguras (Vila Aurora e Solara)
R.inTown = (x, z) => R.TOWNS.some(t => Math.hypot(x - t.x, z - t.z) < t.r);
const eff = (it, k) => (it[k] || 0) * (1 + .12 * (it.plus || 0));
const nm = it => it.k === 'eq' ? it.name + (it.plus ? ' +' + it.plus : '') + (it.sl ? ' ' + '◇'.repeat(it.sl) : '') : it.k === 'mat' ? MATS[it.id].n : it.k === 'pot' ? POTS[it.id].n : (it.n + ' ouro');
const sellPrice = it => it.k === 'eq' && it.slot === 'cape' ? it.ilvl * 40 : it.k === 'eq' ? Math.round((it.ilvl * 5 + 5) * (1 + it.rar * 1.1) * (1 + it.plus * .6) * (1 + (it.sl || 0) * .5) * .5) : (it.k === 'mat' ? MATS[it.id].v : POTS[it.id].v);
const MAXPLUS = 10;
const upRate = p => [1, 1, 1, .85, .7, .55, .4, .3, .2, .12][p] || 0;
const upCost = it => { const p = it.plus || 0; return { ferro: p + 1, essencia: p >= 4 ? Math.floor(p / 2) : 0, gold: Math.round(40 * Math.pow(p + 1, 1.7)) }; };
const slotPool = cls => cls === 'cavaleiro' ? ['weapon', 'armor', 'helmet', 'boots', 'ring', 'bracelet', 'earring', 'weapon', 'shield', 'shield'] : ['weapon', 'armor', 'helmet', 'boots', 'ring', 'bracelet', 'earring', 'weapon'];
/** Origem sorteada para itens sem monstro (caixas, missões): um monstro com nível próximo do item. */
const originFor = ilvl => { const c = Object.keys(MT).filter(k => OG[k] && !k.startsWith('dg_') && MT[k].lv[0] <= ilvl + 4 && MT[k].lv[1] >= ilvl - 8); return c.length ? pick(c) : undefined; };

/** Capas: sem raridade, atributos fixos. 'm' = estola azul (magos), 'p' = capa vermelha (físicos). */
/** Estilo da capa de cada classe: p = capa vermelha (físico), m = estola azul (mágico), a = manto encapuzado (assassino). */
const capeKind = cls => cls === 'assassino' ? 'a' : (cls === 'mago' || cls === 'arqueiro' || cls === 'pierrot') ? 'm' : 'p';
const isMag = cls => capeKind(cls) === 'm';
const CAPEWHO = { p: 'Tanque, Guerreiro e Cavaleiro Pesado', m: 'Arqueiro, Mago e Pierrot', a: 'Assassino' };
function capeStats(it) {
  const m = it.cs === 'm', a = it.cs === 'a', L = it.ilvl;
  it.rar = 0; it.plus = 0; it.atk = 0; it.def = Math.round(1 + L * (m ? .25 : a ? .35 : .5)); it.hp = Math.round(L * (m ? 3 : a ? 3.5 : 4));
  it.bon = a ? { agi: Math.max(1, Math.round(L / 5)), str: Math.max(1, Math.round(L / 9)), vit: Math.max(1, Math.round(L / 10)) } : m ? { int: Math.max(1, Math.round(L / 5)), agi: Math.max(1, Math.round(L / 10)), vit: Math.max(1, Math.round(L / 10)) } : { str: Math.max(1, Math.round(L / 6)), agi: Math.max(1, Math.round(L / 8)), vit: Math.max(1, Math.round(L / 10)) };
  it.icon = m ? '🧣' : a ? '🥷' : '🧥'; delete it.sl; delete it.mo; return it;
}
function genCape(ilvl, cls, name) {
  ilvl = Math.max(1, Math.min(80, Math.floor(ilvl))); const tier = ilvl >= 68 ? 9 : ilvl >= 56 ? 8 : ilvl >= 44 ? 7 : Math.min(6, Math.floor(ilvl / 4)), kind = capeKind(cls), m = kind === 'm';
  const it = { k: 'eq', slot: 'cape', ilvl, rar: 0, req: Math.max(1, ilvl - 1), plus: 0, cs: kind, hp: 0, atk: 0, def: 0, bon: {} };
  it.name = kind === 'a' ? (tier > 6 ? XCA[tier - 7] : CAN[tier]) : tier > 6 ? (m ? XCM : XCP)[tier - 7] : (m ? CMN : CPN)[tier]; if (name) it.name = name; return capeStats(it);
}
function rarRoll(b) { b = b || 0; const r = Math.random(), k = 1 + b; if (r < .02 * k) return 3; if (r < .12 * k) return 2; if (r < .4 + .05 * b) return 1; return 0; }
/** Gera um equipamento. `cls` fixa a classe da arma; sem ela, 70% de chance de ser da classe do dono (`owner`). */
function genItem(slot, ilvl, rar, cls, owner, sl, mo) {
  if (mo === true) mo = originFor(ilvl);
  const tier = ilvl >= 68 ? 9 : ilvl >= 56 ? 8 : ilvl >= 44 ? 7 : Math.min(6, Math.floor(ilvl / 4)), mult = RAR[rar].m, j = () => rnd(.92, 1.08);
  const it = { k: 'eq', slot, ilvl, rar, req: Math.max(1, ilvl - 1), plus: 0, bon: {}, hp: 0, atk: 0, def: 0 };
  if (slot === 'weapon') { cls = cls || (Math.random() < .7 && owner ? owner : pick(Object.keys(CLASSES))); it.cls = cls; it.name = tier > 6 ? XN.weapon[cls][tier - 7] : WN[cls][tier]; it.atk = Math.round((3 + ilvl * 1.7) * mult * j()); it.icon = CLASSES[cls].wi; }
  else if (slot === 'shield') { it.cls = 'cavaleiro'; it.name = tier > 6 ? XN.shield[tier - 7] : SHN[tier]; it.def = Math.round((3 + ilvl * 1.3) * mult * j()); it.hp = Math.round(ilvl * 3 * mult); it.icon = '🛡️'; }
  else if (slot === 'armor') { it.name = tier > 6 ? XN.armor[tier - 7] : AN[tier]; it.def = Math.round((2 + ilvl) * mult * j()); it.icon = '🥋'; }
  else if (slot === 'helmet') { it.name = tier > 6 ? XN.helmet[tier - 7] : HN[tier]; it.def = Math.round((1 + ilvl * .6) * mult * j()); it.icon = '🪖'; }
  else if (slot === 'boots') { it.name = tier > 6 ? XN.boots[tier - 7] : BN[tier]; it.def = Math.round((1 + ilvl * .5) * mult * j()); it.hp = Math.round(ilvl * 2 * mult); it.icon = '👢'; }
  else if (slot === 'bracelet') { it.name = tier > 6 ? XN.bracelet[tier - 7] : BRN[tier]; it.atk = Math.round((1 + ilvl * .45) * mult * j()); it.def = Math.round((1 + ilvl * .3) * mult * j()); it.icon = '📿'; }
  else if (slot === 'earring') { it.name = tier > 6 ? XN.earring[tier - 7] : ERN[tier]; it.hp = Math.round(ilvl * 5 * mult); it.def = Math.round((1 + ilvl * .25) * mult * j()); it.icon = '🧿'; }
  else { it.name = tier > 6 ? XN.ring[tier - 7] : RN[tier]; it.atk = Math.round((1 + ilvl * .6) * mult * j()); it.hp = Math.round(ilvl * 4 * mult); it.icon = '💍'; }
  if (mo && OG[mo]) { it.mo = mo; it.name += ' ' + OG[mo].sf; }
  if (rar >= 2) { if (!it.mo) it.name += ' ' + pick(SUF); const st = ['str', 'agi', 'int', 'vit']; for (let n = 0; n < rar - 1; n++) { const s = pick(st); it.bon[s] = (it.bon[s] || 0) + Math.max(1, Math.round(ilvl / 3)); } }
  if (rar === 3) it.name = '★ ' + it.name;
  if (sl) it.sl = sl;            // encaixes (slots) para gemas — só caem em dungeons
  return it;
}

/* ---------- lojas (preço e item dependem do personagem c) ---------- */
const SHOPS = {
  aurora: [
    { id: 'hp', i: '🧪', n: 'Poção de Vida', d: 'Recupera 40% da vida', c: () => 25, mk: () => ({ k: 'pot', id: 'hp', n: 1 }) },
    { id: 'mp', i: '🔷', n: 'Poção de Mana', d: 'Recupera 40% da mana', c: () => 25, mk: () => ({ k: 'pot', id: 'mp', n: 1 }) },
    { id: 'hp5', i: '🧪', n: 'Poção de Vida ×5', d: 'Pacote econômico', c: () => 110, mk: () => ({ k: 'pot', id: 'hp', n: 5 }) },
    { id: 'capa', i: '🧥', n: 'Capa do Aventureiro (Nv 32)', d: 'Capa vermelha — Tanque, Guerreiro e Cavaleiro Pesado. Sem raridade, atributos fixos; brilha junto com a sua armadura.', c: () => 50000, mk: () => genCape(32, 'guerreiro', 'Capa do Aventureiro') },
    { id: 'estola', i: '🧣', n: 'Estola do Aventureiro (Nv 32)', d: 'Estola azul fina — Arqueiro, Mago e Pierrot. Sem raridade, atributos fixos; brilha junto com a sua armadura.', c: () => 50000, mk: () => genCape(32, 'mago', 'Estola do Aventureiro') },
    { id: 'manto', i: '🥷', n: 'Manto do Aventureiro (Nv 32)', d: 'Manto encapuzado — só para o Assassino. Sem raridade, atributos fixos; brilha junto com a sua armadura.', c: () => 50000, mk: () => genCape(32, 'assassino', 'Manto do Aventureiro') },
    { id: 'box', i: '🎁', n: 'Caixa de Equipamento', d: 'Item aleatório do seu nível. Pode vir raro ou épico!', c: c => 200 + c.level * 25, box: 1, mk: c => genItem(pick(slotPool(c.cls)), Math.max(1, c.level + ri(0, 1)), rarRoll(.5), undefined, c.cls, 0, true) }],
  solara: [
    { id: 'capa2', i: '🧥', n: 'Capa Solar (Nv 64)', d: 'Capa vermelha — Tanque, Guerreiro e Cavaleiro Pesado. Sem raridade, atributos fixos; brilha junto com a sua armadura.', c: () => 75000, mk: () => genCape(64, 'guerreiro') },
    { id: 'estola2', i: '🧣', n: 'Estola Solar (Nv 64)', d: 'Estola azul fina — Arqueiro, Mago e Pierrot. Sem raridade, atributos fixos; brilha junto com a sua armadura.', c: () => 75000, mk: () => genCape(64, 'mago') },
    { id: 'manto2', i: '🥷', n: 'Manto Solar (Nv 64)', d: 'Manto encapuzado — só para o Assassino. Sem raridade, atributos fixos; brilha junto com a sua armadura.', c: () => 75000, mk: () => genCape(64, 'assassino') },
    { id: 'hp2', i: '🍷', n: 'Poção de Vida Superior', d: 'Recupera 70% da vida', c: () => 90, mk: () => ({ k: 'pot', id: 'hp2', n: 1 }) },
    { id: 'mp2', i: '💧', n: 'Poção de Mana Superior', d: 'Recupera 70% da mana', c: () => 90, mk: () => ({ k: 'pot', id: 'mp2', n: 1 }) },
    { id: 'hp2x5', i: '🍷', n: 'Poção de Vida Superior ×5', d: 'Pacote do deserto', c: () => 400, mk: () => ({ k: 'pot', id: 'hp2', n: 5 }) },
    { id: 'mp2x5', i: '💧', n: 'Poção de Mana Superior ×5', d: 'Pacote do deserto', c: () => 400, mk: () => ({ k: 'pot', id: 'mp2', n: 5 }) },
    { id: 'box2', i: '🎁', n: 'Caixa Solar', d: 'Equipamento de nível 50+ (qualquer peça). Boas chances de raro/épico.', c: c => 6000 + c.level * 120, box: 1, mk: c => genItem(pick(slotPool(c.cls)), Math.max(50, c.level) + ri(0, 3), rarRoll(1.5), undefined, c.cls, 0, true) },
    { id: 'boxw', i: '⚔️', n: 'Caixa de Arma Solar', d: 'Uma arma da SUA classe, nível 52+.', c: c => 12000 + c.level * 200, box: 1, mk: c => genItem('weapon', Math.max(52, c.level + 2) + ri(0, 3), rarRoll(2), c.cls, c.cls, 0, true) },
    { id: 'boxf', i: '👑', n: 'Caixa Faraônica', d: 'Equipamento de nível 60+ com chance muito alta de raro e épico.', c: () => 45000, box: 1, mk: c => genItem(pick(slotPool(c.cls)), Math.max(60, c.level + 4) + ri(0, 4), rarRoll(4), undefined, c.cls, 0, true) }],
};

/* ---------- inventário ---------- */
function canAdd(arr, it) { if (it.k === 'mat' || it.k === 'pot') { if (arr.some(s => s && s.k === it.k && s.id === it.id && s.n < 99)) return true; } return arr.includes(null); }
function addItem(arr, it) {
  if (it.k === 'mat' || it.k === 'pot') { for (const s of arr) { if (s && s.k === it.k && s.id === it.id && s.n < 99) { const a = Math.min(99 - s.n, it.n); s.n += a; it.n -= a; if (it.n <= 0) return true; } } }
  const i = arr.indexOf(null); if (i < 0) return false; arr[i] = it; return true;
}
const have = (c, id) => c.inv.reduce((a, s) => a + (s && s.id === id && (s.k === 'mat' || s.k === 'pot') ? s.n : 0), 0);
function take(c, id, n) { for (let i = 0; i < c.inv.length && n > 0; i++) { const s = c.inv[i]; if (s && s.id === id && (s.k === 'mat' || s.k === 'pot')) { const a = Math.min(s.n, n); s.n -= a; n -= a; if (s.n <= 0) c.inv[i] = null; } } }

/* ---------- atributos derivados ---------- */
function stats(c) {
  const C = CLASSES[c.cls];
  const st = { str: C.base.str + c.alloc.str, agi: C.base.agi + c.alloc.agi, int: C.base.int + c.alloc.int, vit: C.base.vit + c.alloc.vit };
  const gm = (c.gmu || 0) > Date.now();   // Buff do GM: +100 atributos, +1000 vida/mana, +200 dano/defesa
  let atk = 0, def = 0, hp = 0;
  for (const k in c.eq) { const it = c.eq[k]; if (!it) continue; atk += eff(it, 'atk'); def += eff(it, 'def'); hp += it.hp || 0; for (const s in it.bon) st[s] += it.bon[s]; }
  if (c.gm) for (const k of ['str', 'agi', 'int', 'vit']) st[k] *= 20;   // GM: atributos ×20
  if (gm) { st.str += 100; st.agi += 100; st.int += 100; st.vit += 100; }
  const kn = c.cls === 'cavaleiro', as = c.cls === 'assassino', tk = c.cls === 'tanque', pr = c.cls === 'pierrot';
  return { ...st, gm, atk, def: (def + st.vit * .4) * (tk ? 1.75 : kn ? 1.4 : pr ? .8 : 1) + (gm ? 200 : 0), hpBonus: hp,
    maxHp: Math.round((50 + st.vit * 10 + c.level * 8 + hp) * (tk ? 1.3 : kn ? 1.15 : as ? .9 : pr ? .85 : 1)) + (gm ? 1000 : 0),
    maxMp: Math.round(30 + st.int * 5 + c.level * 3 + (C.main === 'int' ? 20 : 0) + (kn ? 25 : as ? 20 : tk ? 15 : pr ? 10 : 0)) + (gm ? 1000 : 0),
    dmg: (st[C.main] * (tk ? .8 : 1.0) + atk + c.level * 1.2) * (tk ? .85 : pr ? .85 : 1) + (gm ? 200 : 0),
    luck: pr ? Math.round((10 + c.level * .3 + st.agi * .05) * 10) / 10 : 0, critMul: pr ? 2.1 : 1.7,
    // Retornos decrescentes: crítico/esquiva/velocidade nunca disparam, por mais pontos que se invista.
    crit: 5 + (as ? 8 : 0) + (pr ? 14 : 0) + 45 * st.agi / (st.agi + 200),
    dodge: 25 * st.agi / (st.agi + 250),
    atkSpd: (1 + .8 * st.agi / (st.agi + 300)) * (as ? 1.2 : 1) };
}

/* ---------- TÍTULOS ---------- */
const TSTEPS = [1, 10, 50, 100], TCOL = { 1: '#9fe7b0', 10: '#7fd6ff', 50: '#c79bff', 100: '#ffb347', bright: '#ffe14a' };
const BRIGHT_SLOTS = ['weapon', 'armor', 'helmet', 'boots', 'ring', 'ring2', 'bracelet', 'bracelet2', 'earring', 'earring2'];
/** Progresso do título "O mais brilhante": todas as peças equipadas (exceto capa) em +10. */
function brightProg(c) {
  const need = BRIGHT_SLOTS.concat(c.cls === 'cavaleiro' ? ['shield'] : []); let n = 0;
  for (const s of need) if (c.eq && c.eq[s] && (c.eq[s].plus || 0) >= MAXPLUS) n++;
  return { n, total: need.length, ok: n === need.length && (!c.eq.shield || (c.eq.shield.plus || 0) >= MAXPLUS) };
}
/** Todos os títulos do jogo (com o estado para o personagem c). */
function titleList(c) {
  const out = [];
  for (const d of DUNGEONS) { const cur = (c.dgc && c.dgc[d.id]) || 0; for (const st of TSTEPS) if (d.titles && d.titles[st]) out.push({ id: d.id + ':' + st, t: d.titles[st], col: TCOL[st], dg: d.name, icon: d.icon, need: st, cur: Math.min(cur, st), have: cur >= st, desc: st === 1 ? 'Conclua ' + d.name + ' 1 vez' : 'Conclua ' + d.name + ' ' + st + ' vezes' }); }
  const b = brightProg(c); out.push({ id: 'bright', t: 'O mais brilhante', col: TCOL.bright, dg: 'Aprimoramento', icon: '✨', need: b.total, cur: b.n, have: !!c.tb, desc: 'Todas as peças equipadas em +10 (a capa não conta)' });
  return out;
}
const titleInfo = id => { if (id === 'bright') return { t: 'O mais brilhante', col: TCOL.bright, bright: 1 }; const [d, st] = String(id).split(':'), dg = DUNGEONS.find(x => x.id === d); return dg && dg.titles && dg.titles[st] ? { t: dg.titles[st], col: TCOL[st] || '#fff' } : null; };
const titleHave = (c, id) => titleList(c).some(x => x.id === id && x.have);
/** Servidor chama ao concluir uma dungeon. Devolve os títulos novos. */
function dgDone(c, def) {
  c.dgc = c.dgc || {}; const before = new Set(titleList(c).filter(x => x.have).map(x => x.id));
  c.dgc[def.id] = Math.min(9999, (c.dgc[def.id] || 0) + 1);
  return titleList(c).filter(x => x.have && !before.has(x.id));
}
function chkTitles(c, out) {
  if (!c.tb && brightProg(c).ok) { c.tb = 1; out.push({ toast: '🏅 Novo título: O mais brilhante!' }, { sfx: 'rare' }, { log: '<span style="color:#ffe14a">🏅 Título conquistado: <b>O mais brilhante</b> — todas as suas peças estão em +10! Abra com <b>T</b>.</span>' }); }
}

/** Custo (em pontos) de subir da rank r para r+1. */
const skCost = r => r < 3 ? 1 : r < 10 ? 2 : 3;
/** Sorte nos drops (só o Pierrot tem). `boost` = buff temporário (+60% = .6). */
const luckOf = (c, boost) => c.cls === 'pierrot' ? Math.round(stats(c).luck * (1 + (boost || 0)) * 10) / 10 : 0;
/** Há alguma habilidade que o jogador pode melhorar agora? (usado para mostrar o aviso de pontos) */
const canSkillUp = c => CLASSES[c.cls].skills.some((s, i) => c.level >= s.lv && (c.sk[i] || 0) < MAXRANK && c.sp >= skCost(c.sk[i] || 0));

/** Valores de uma habilidade conforme o rank. */
const ph = (k, a, b) => a * Math.min(k, 4) + b * Math.max(0, k - 4);        // ranks 1–5 rendem mais; do 6 ao 20 o ganho é menor
const BCAP = { defloss: .6, shield: .75, evade: .6, haste: 1, crit: .8, dmg: 1.2, defdmg: 2.5, luck: 1.2 };
function skStat(cls, i, rank) {
  const s = CLASSES[cls].skills[i], k = Math.max(1, rank || 0) - 1;
  const bf = {}; if (s.buffs) for (const a in s.buffs) bf[a] = Math.min(BCAP[a] || 9, s.buffs[a] * (s.fixBuff ? 1 : 1 + ph(k, .15, .05)));
  const cc = x => x ? Math.round(x * Math.min(1.6, 1 + .05 * k)) : 0;
  return { ...s, mult: s.mult ? s.mult * (1 + ph(k, .2, .08)) : 0, mp: Math.round(s.mp * (1 + ph(k, .06, .03))), cd: s.cdMin != null ? s.cd - (s.cd - s.cdMin) * Math.min(1, k / (MAXRANK - 1)) : s.cd * (1 - Math.min(.5, ph(k, .04, .015))), radius: s.radius ? s.radius + ph(k, .25, .1) : 0, pct: s.pct ? Math.min(.9, s.pct * (1 + ph(k, .15, .05))) : 0, dur: s.dur ? (s.fixDur ? s.dur : s.dur * (1 + ph(k, .1, .03))) : 0, buffs: s.buffs ? bf : null, slow: s.slow ? s.slow * (1 + ph(k, .1, .03)) : 0, defMult: s.defMult ? s.defMult * (1 + ph(k, .2, .08)) : 0, hits: s.hits ? s.hits + (k >= 4 ? 1 : 0) + (k >= 10 ? 1 : 0) + (k >= 16 ? 1 : 0) : 0, stun: cc(s.stun), root: cc(s.root), lift: cc(s.lift), clones: s.cloneMult ? 1 + Math.floor(k / 4) : 0, cloneMult: s.cloneMult ? s.cloneMult * (1 + ph(k, .05, .02)) : 0 };
}

/** Dano de um golpe. d = stats(); o = {mult, defMult, exec, marked, buffs:{dmg,defdmg,crit,combo}}; mon = {def, hp, maxHp}. */
function hitDamage(d, o, mon) {
  const b = o.buffs || {};
  const crit = o.forceCrit || Math.random() < Math.min(.75, (d.crit + (b.crit || 0) * 100) / 100);
  const base = d.dmg + (o.defMult ? d.def * o.defMult : 0) + (b.defdmg || 0) * d.def;
  let dmg = base * (1 + (b.dmg || 0)) * o.mult * rnd(.9, 1.1);
  if (crit) dmg *= (d.critMul || 1.7); if (o.marked) dmg *= 1.35; if (o.exec && mon.hp < mon.maxHp * .4) dmg *= 2; dmg *= (1 + (b.combo || 0));
  return { dmg: Math.max(1, Math.round(dmg * 100 / (100 + mon.def * 2))), crit };
}

/* ---------- recompensas de combate ---------- */
/** XP de um monstro para um jogador (reduz se o jogador é muito mais forte que o monstro). */
function xpFor(T, mlvl, plvl) {
  const d = plvl - mlvl, pen = d >= 10 ? .05 : d >= 7 ? .25 : d >= 4 ? .6 : 1;
  return Math.max(1, Math.round(T.xp * (1 + .15 * (mlvl - T.lv[0])) * pen));
}
/** Em qual "casa" do equipamento o item entra (anéis, braceletes e brincos têm 2 casas). */
function eqKey(c, it, want) {
  const s = it.slot; if (!DUPKEY[s]) return s;
  if (want === s || want === s + '2') return want;
  if (!c.eq[s]) return s; if (!c.eq[s + '2']) return s + '2';
  const pw = x => x.ilvl * (1 + x.rar) + (x.plus || 0) * 3; return pw(c.eq[s + '2']) < pw(c.eq[s]) ? s + '2' : s;
}
/** Aparência compacta (vai para os outros jogadores): chave|origem|+n|raridade;... */
function apOf(c) { const o = []; for (const k in c.eq) { const it = c.eq[k]; if (it) o.push(k + '|' + (it.mo || '') + '|' + (it.plus || 0) + '|' + it.rar); } return o.join(';'); }
function rollLoot(T, mlvl, cls, luck) {
  luck = luck || 0;
  const out = [];
  out.push({ k: 'gold', n: Math.round(ri(T.gold[0], T.gold[1]) * (1 + (mlvl - T.lv[0]) * .2)) });
  for (const id in T.mats) if (Math.random() < T.mats[id]) out.push({ k: 'mat', id, n: ri(1, T.matMax || 2) });
  if (Math.random() < T.eq * (1 + luck / 100)) { const slot = pick(slotPool(cls)); let rar = rarRoll((T.rb || 0) + luck / 50); if (T.boss) rar = Math.max(2, rar); const lk = 1 + luck / 50, sl = T.dg ? (Math.random() < .015 * lk ? 2 : Math.random() < .08 * lk ? 1 : 0) : 0; { const it = genItem(slot, Math.max(1, mlvl + ri(0, 2)), rar, undefined, cls, sl, T.id); if (luck > 0 && rar === 3) it.plus = ri(0, 4); out.push(it); } }
  if (mlvl >= 6 && Math.random() < (T.boss ? .05 : T.dg ? .004 : .0025) * (1 + luck / 100)) out.push(genCape(mlvl + ri(0, 2), cls));
  if (Math.random() < T.pot) out.push({ k: 'pot', id: (Math.random() < .65 ? 'hp' : 'mp') + (T.lv[0] >= 50 ? '2' : ''), n: ri(1, T.boss ? 4 : 1) });
  return out;
}

/** Loot de um baú de dungeon (tier 1..3). Pode ser bom OU ruim: nível menor, raridade comum e sem slot. */
function dgChestLoot(dg, tier, cls, luck) {
  luck = luck || 0; const lk = 1 + luck / 50;
  const out = [], mk = (bad) => {
    const ilvl = Math.max(1, ri(dg.ilvl[0], dg.ilvl[1]) + (tier - 1) - (bad ? ri(8, 16) : 0));
    const rar = bad ? (Math.random() < .75 ? 0 : 1) : rarRoll([.7, 1.3, 2.4][tier - 1] + luck / 50);
    const p2 = bad ? 0 : [.07, .12, .22][tier - 1] * lk, p1 = bad ? .04 : [.30, .38, .45][tier - 1] * lk, r = Math.random();
    const sl = r < p2 ? 2 : r < p2 + p1 ? 1 : 0;
    const mo = Math.random() < .7 ? ['dg_s1', 'dg_s2', 'dg_boss'][tier - 1] : pick(['dg_a', 'dg_b', 'dg_c', 'dg_d']);
    const it = genItem(pick(slotPool(cls)), ilvl, rar, undefined, cls, sl, mo); if (luck > 0 && rar === 3) it.plus = ri(0, 4); return it;
  };
  out.push(mk(Math.random() < [.30, .22, .12][tier - 1] / (1 + luck / 100)));
  if (tier === 3 && Math.random() < .4) out.push(mk(false));
  if (Math.random() < [.02, .04, .1][tier - 1] * (1 + luck / 100)) out.push(genCape(ri(dg.ilvl[0], dg.ilvl[1]), cls));
  out.push({ k: 'gold', n: ri(600, 1100) * tier });
  if (Math.random() < .5) out.push({ k: 'mat', id: 'essencia', n: ri(1, 1 + tier) });
  return out;
}
function gainXp(c, n) { c.xp += n; let up = 0; while (c.xp >= xpNeed(c.level)) { c.xp -= xpNeed(c.level); c.level++; c.pts += PTS_PER_LEVEL; c.sp++; up++; } return up; }
const npcById = id => NPCS.find(n => n.id === id);
function questKill(c, type) {
  const out = [];
  for (const q of QUESTS) { const st = c.quests[q.id]; if (st && !st.done && q.tg === type && st.n < q.qty) { st.n++; if (st.n >= q.qty) out.push({ toast: 'Missão concluída: ' + q.t, sfx: 'questDone', log: `<span style="color:#6fdc7f">📜 Missão "${q.t}" pronta! Fale com ${npcById(q.npc).name}.</span>` }); } }
  return out;
}

/* ---------- criação / migração de personagens ---------- */
/** Barras de habilidade: 16 casas (1–8 e Shift+1–8); cada casa guarda o índice da habilidade (0–7) ou -1. */
const defBar = () => [0, 1, 2, 3, 4, 5, 6, 7, -1, -1, -1, -1, -1, -1, -1, -1];
function cleanBar(b) {
  const o = defBar().fill(-1), seen = new Set();
  if (!Array.isArray(b)) return defBar();
  for (let i = 0; i < 16; i++) { const v = Math.floor(b[i]); if (v >= 0 && v < 8 && !seen.has(v)) { o[i] = v; seen.add(v); } }
  return o;
}
function newChar(cls, name) {
  const c = { id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), name, cls, v: R.VERSION, level: 1, xp: 0, pts: 0, sp: 1, sk: [1, 0, 0, 0, 0, 0, 0, 0], alloc: { str: 0, agi: 0, int: 0, vit: 0 }, gold: 50, inv: Array(24).fill(null), eq: { weapon: null, helmet: null, armor: null, boots: null, ring: null }, quests: {}, kills: 0 };
  c.bar = defBar(); c.eq.weapon = genItem('weapon', 1, 0, cls); c.eq.armor = genItem('armor', 1, 0);
  c.inv[0] = { k: 'pot', id: 'hp', n: 5 }; c.inv[1] = { k: 'pot', id: 'mp', n: 3 };
  if (cls === 'cavaleiro') c.eq.shield = genItem('shield', 1, 0);
  return c;
}

const GM_GOLD = 999999999;
/** Personagem do GM: nível máximo, melhor equipamento +10, habilidades no máximo. */
function gmChar(cls, old) {
  const C = CLASSES[cls], c = old || newChar(cls, 'GM ' + C.n);
  c.gm = 1; c.gmu = 0; c.level = MAX_LEVEL; c.xp = 0; c.sp = 0; c.sk = Array(8).fill(MAXRANK);
  const tot = PTS_PER_LEVEL * (MAX_LEVEL - 1), main = Math.round(tot * .6); c.alloc = { str: 0, agi: 0, int: 0, vit: tot - main }; c.alloc[C.main] += main; c.pts = 0;
  c.gold = GM_GOLD;
  const mk = (slot, w) => { const it = genItem(slot, 80, 3, cls, cls, 0, true); if (slot === 'weapon') it.cls = cls; it.plus = MAXPLUS; return it; };
  c.eq = { weapon: mk('weapon'), helmet: mk('helmet'), armor: mk('armor'), boots: mk('boots'), ring: mk('ring'), ring2: mk('ring'), bracelet: mk('bracelet'), bracelet2: mk('bracelet'), earring: mk('earring'), earring2: mk('earring'), cape: genCape(80, cls) };
  if (cls === 'cavaleiro') c.eq.shield = mk('shield');
  for (const k in c.eq) c.eq[k] = cleanItem(c.eq[k]);
  c.tb = 1; c.title = 'bright';
  c.inv = Array(24).fill(null); c.inv[0] = { k: 'pot', id: 'hp', n: 99 }; c.inv[1] = { k: 'pot', id: 'mp', n: 99 };
  c.bar = defBar(); c.v = R.VERSION;
  return c;
}
/** Limites máximos possíveis de um equipamento (para detectar itens editados). */
function itemMax(slot, ilvl, rar) {
  const m = RAR[rar].m * 1.09, o = { atk: 0, def: 0, hp: 0 };
  if (slot === 'weapon') o.atk = (3 + ilvl * 1.7) * m;
  else if (slot === 'shield') { o.def = (3 + ilvl * 1.3) * m; o.hp = ilvl * 3 * RAR[rar].m; }
  else if (slot === 'armor') o.def = (2 + ilvl) * m;
  else if (slot === 'helmet') o.def = (1 + ilvl * .6) * m;
  else if (slot === 'boots') { o.def = (1 + ilvl * .5) * m; o.hp = ilvl * 2 * RAR[rar].m; }
  else if (slot === 'bracelet') { o.atk = (1 + ilvl * .45) * m; o.def = (1 + ilvl * .3) * m; }
  else if (slot === 'cape') { o.def = 1 + ilvl * .5; o.hp = ilvl * 4; }
  else if (slot === 'earring') { o.hp = ilvl * 5 * RAR[rar].m; o.def = (1 + ilvl * .25) * m; }
  else { o.atk = (1 + ilvl * .6) * m; o.hp = ilvl * 4 * RAR[rar].m; }
  return o;
}
/** Valida/corrige um item vindo de um save antigo. Devolve null se for inválido. */
function cleanItem(it) {
  if (!it || typeof it !== 'object') return null;
  if (it.k === 'mat') return MATS[it.id] && Number.isFinite(it.n) ? { k: 'mat', id: it.id, n: Math.max(1, Math.min(99, Math.floor(it.n))) } : null;
  if (it.k === 'pot') return POTS[it.id] && Number.isFinite(it.n) ? { k: 'pot', id: it.id, n: Math.max(1, Math.min(99, Math.floor(it.n))) } : null;
  if (it.k !== 'eq' || !SLOTS[it.slot] || !Number.isFinite(it.ilvl) || !(it.rar >= 0 && it.rar <= 3)) return null;
  it.ilvl = Math.max(1, Math.min(80, Math.floor(it.ilvl))); it.rar = Math.floor(it.rar);
  it.plus = Math.max(0, Math.min(MAXPLUS, Math.floor(it.plus || 0))); it.req = Math.max(1, Math.min(it.ilvl, Math.floor(it.req || it.ilvl - 1)));
  const mx = itemMax(it.slot, it.ilvl, it.rar);
  for (const k of ['atk', 'def', 'hp']) { const v = Number(it[k]) || 0; it[k] = Math.max(0, Math.min(Math.round(mx[k] + 1), Math.round(v))); }
  const bmax = Math.max(1, Math.round(it.ilvl / 3)) * Math.max(0, it.rar - 1), nb = {};
  for (const s of ['str', 'agi', 'int', 'vit']) if (it.bon && it.bon[s] > 0) nb[s] = Math.min(bmax, Math.floor(it.bon[s]));
  it.bon = nb;
  it.sl = Math.max(0, Math.min(2, Math.floor(it.sl || 0))); if (!it.sl) delete it.sl;
  if (!(typeof it.mo === 'string' && OG[it.mo])) delete it.mo;
  if (typeof it.name !== 'string') it.name = SLOTS[it.slot];
  it.name = it.name.slice(0, 60);
  if (it.slot === 'weapon' && !CLASSES[it.cls]) return null;
  if (it.slot === 'cape') { it.cs = it.cs === 'm' || it.cs === 'a' ? it.cs : 'p'; capeStats(it); }
  return it;
}
/** Atualiza personagens antigos para as regras atuais. Nunca apaga o personagem: só corrige/ajusta. */
function migrate(c) {
  if (!c.sk || !Array.isArray(c.sk)) { c.sk = Array(8).fill(0); c.sk[0] = 1; if (c.sp === undefined) c.sp = c.level; }
  while (c.sk.length < 8) c.sk.push(0); if (c.sp === undefined) c.sp = 0;
  c.bar = cleanBar(c.bar);
  c.quests = c.quests || {}; c.inv = Array.isArray(c.inv) ? c.inv : []; while (c.inv.length < 24) c.inv.push(null);
  c.id = c.id || ('c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)); c.name = c.name || CLASSES[c.cls].n;
  c.kills = Math.max(0, Math.floor(c.kills) || 0);
  c.gm = c.gm ? 1 : 0; c.gmu = (Number(c.gmu) || 0) > Date.now() ? Number(c.gmu) : 0;
  { const dc = {}; if (c.dgc && typeof c.dgc === 'object') for (const d of DUNGEONS) { const n = Math.floor(c.dgc[d.id]); if (n > 0) dc[d.id] = Math.min(9999, n); } c.dgc = dc; c.tb = c.tb ? 1 : 0; if (!c.tb && brightProg(c).ok) c.tb = 1; if (typeof c.title !== 'string' || (c.title && !titleHave(c, c.title))) c.title = ''; }
  { const fr = []; if (Array.isArray(c.fr)) for (const n of c.fr) { if (typeof n === 'string') { const t = n.trim().slice(0, 16); if (t && !fr.some(x => x.toLowerCase() === t.toLowerCase())) fr.push(t); } if (fr.length >= 50) break; } c.fr = fr; }
  { const tx = {}; if (c.tix && typeof c.tix === 'object') for (const d of DUNGEONS) { const n = Math.floor(c.tix[d.id]); if (n > 0) tx[d.id] = Math.min(5, n); } c.tix = tx; }
  if (!(c.run && typeof c.run === 'object' && DUNGEONS.some(d => d.id === c.run.id))) delete c.run;
  if ((c.v || 0) < R.VERSION) {
    c.level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(c.level) || 1));
    // novo equilíbrio: os pontos de atributo são devolvidos conforme a NOVA regra (você redistribui)
    c.alloc = { str: 0, agi: 0, int: 0, vit: 0 }; c.pts = PTS_PER_LEVEL * (c.level - 1);
    c.xp = Math.max(0, Math.min(Math.floor(c.xp) || 0, xpNeed(c.level) - 1));
    c.gold = Math.max(0, Math.min(Math.floor(c.gold) || 0, c.level * GOLD_CAP_PER_LEVEL));
    c.sk = c.sk.map(r => Math.max(0, Math.min(MAXRANK, Math.floor(r) || 0))); c.sp = Math.max(0, Math.min(c.level + 10, Math.floor(c.sp) || 0));
    for (const k of Object.keys(c.eq || {})) { c.eq[k] = cleanItem(c.eq[k]); if (c.eq[k] && (!validKey(k) || c.eq[k].slot !== keyBase(k))) c.eq[k] = null; }
    c.inv = c.inv.map(cleanItem);
    for (const id in c.quests) if (!QUESTS.some(q => q.id === id)) delete c.quests[id];
    c.v = R.VERSION; c._respec = true;
  }
  return c;
}
function migrateStash(st) { st = Array.isArray(st) ? st : []; st = st.slice(0, 40).map(cleanItem); while (st.length < 40) st.push(null); return st; }

/* ====================== AÇÕES DE ECONOMIA ======================
   sess = { c: personagem, stash: baú da conta }; m = ação {t, ...}; ctx = { near(npc)->bool, now }.
   Devolve { ok, out:[{toast|log|sfx|lvl|heal}], spawn:[{item,life}] } e altera sess diretamente.
   O servidor chama isto para cada pedido do jogador; o modo offline chama o mesmo código. */
/** Junta pilhas e ordena uma lista de itens (mochila ou baú): equipamentos (por peça, classe, raridade, nível, aprimoramento), poções e materiais; sem buracos. */
function organizeList(list, cls) {
  const eq = [], rest = [], pots = {}, mats = {}, tm = {}, ORD = ['weapon', 'armor', 'helmet', 'boots', 'ring', 'bracelet', 'earring', 'shield', 'cape'];
  for (const it of list) { if (!it) continue; if (it.k === 'eq') eq.push(it); else if (it.k === 'pot' || it.k === 'mat') { const g = it.k === 'pot' ? pots : mats; g[it.id] = (g[it.id] || 0) + it.n; tm[it.k + it.id] = it; } else rest.push(it); }
  const foreign = it => Number(!!(it.cls && it.cls !== cls));
  eq.sort((a, b) => ORD.indexOf(a.slot) - ORD.indexOf(b.slot) || foreign(a) - foreign(b) || String(a.cls || '').localeCompare(String(b.cls || '')) || b.rar - a.rar || b.ilvl - a.ilvl || (b.plus || 0) - (a.plus || 0) || String(a.name).localeCompare(String(b.name)));
  const o = [...eq];
  const stacks = (g, k, ids) => { for (const id of ids) { let n = g[id]; while (n > 0) { const q = Math.min(99, n); o.push({ ...tm[k + id], n: q }); n -= q; } } };
  stacks(pots, 'pot', Object.keys(pots).sort()); stacks(mats, 'mat', Object.keys(mats).sort((a, b) => String(MATS[a].n).localeCompare(String(MATS[b].n)))); o.push(...rest);
  while (o.length < list.length) o.push(null); list.splice(0, list.length, ...o.slice(0, list.length));
}
function act(sess, m, ctx) {
  const c = sess.c, stash = sess.stash, out = [], spawn = [];
  const T = s => out.push({ toast: s }), L = s => out.push({ log: s }), F = s => out.push({ sfx: s });
  if (c.gm) c.gold = GM_GOLD;   // GM: dinheiro infinito
  const fail = s => { if (s) T(s); if (c.gm) c.gold = GM_GOLD; return { ok: false, out, spawn }; };
  const done = () => { if (c.gm) c.gold = GM_GOLD; chkTitles(c, out); return { ok: true, out, spawn }; };
  const intIn = (v, a, b) => Number.isInteger(v) && v >= a && v < b;
  const colOf = it => it.k === 'eq' ? RAR[it.rar].c : '#fff';
  const npcFor = tab => { const n = npcById(m.npc); if (!n || !n.tabs.includes(tab)) return null; if (ctx && ctx.near && !ctx.near(n)) return null; return n; };
  const t = m && m.t;

  if (t === 'equip') {
    if (!intIn(m.i, 0, c.inv.length)) return fail(); const it = c.inv[m.i]; if (!it || it.k !== 'eq') return fail();
    if (c.level < it.req) return fail('Nível ' + it.req + ' necessário');
    if (it.cls && it.cls !== c.cls) return fail('Item de outra classe');
    if (it.slot === 'cape' && it.cs !== capeKind(c.cls)) return fail((it.cs === 'm' ? 'Estola azul' : it.cs === 'a' ? 'Manto encapuzado' : 'Capa vermelha') + ': só para ' + CAPEWHO[it.cs]);
    const key = eqKey(c, it, m.key); const old = c.eq[key]; c.eq[key] = it; c.inv[m.i] = old || null; F('equip'); T('Equipado: ' + nm(it)); return done();
  }
  if (t === 'unequip') {
    const it = validKey(String(m.slot)) && c.eq[m.slot]; if (!it) return fail();
    const j = c.inv.indexOf(null); if (j < 0) return fail('Mochila cheia!'); c.inv[j] = it; c.eq[m.slot] = null; return done();
  }
  if (t === 'stat') { if (!STN[m.k] || c.pts <= 0) return fail(); c.alloc[m.k]++; c.pts--; F('ui'); return done(); }
  if (t === 'title') { const id = String(m.id || ''); if (id && !titleHave(c, id)) return fail('Título bloqueado'); c.title = id; return done(); }
  if (t === 'bar') { if (!Array.isArray(m.bar) || m.bar.length !== 16) return fail(); c.bar = cleanBar(m.bar); return done(); }
  if (t === 'skup') {
    if (!intIn(m.i, 0, 8)) return fail(); const s = CLASSES[c.cls].skills[m.i], r = c.sk[m.i] || 0; if (r >= MAXRANK) return fail();
    if (c.level < s.lv) return fail('Nível ' + s.lv + ' necessário');
    const cost = skCost(r); if (c.sp < cost) return fail('Pontos de habilidade insuficientes');
    c.sp -= cost; c.sk[m.i] = r + 1; if (!r) { c.bar = cleanBar(c.bar); if (!c.bar.includes(m.i)) { const e = c.bar.indexOf(-1); if (e >= 0) c.bar[e] = m.i; } } F('learn'); T((r ? '⬆️ ' : '📖 ') + s.n + ' — Rank ' + (r + 1));
    L(`<span style="color:#ffe28a">${s.i} ${s.n} ${r ? 'melhorada para' : 'aprendida —'} rank ${r + 1}</span>`); return done();
  }
  if (t === 'pot') {
    const kind = m.kind; if (!POTS[kind]) return fail(); const now = (ctx && ctx.now) || 0;
    if (now && sess.potAt && now < sess.potAt + 2500) return fail();
    const idx = c.inv.findIndex(s => s && s.k === 'pot' && s.id === kind); if (idx < 0) return fail('Sem ' + POTS[kind].n);
    const s = c.inv[idx]; s.n--; if (s.n <= 0) c.inv[idx] = null; if (now) sess.potAt = now; out.push({ heal: kind }); return done();
  }
  if (t === 'dropi') {
    if (!intIn(m.i, 0, c.inv.length) || !c.inv[m.i]) return fail(); const it = c.inv[m.i]; c.inv[m.i] = null; spawn.push({ item: it, life: 30000 });
    L(`Você largou <b style="color:${colOf(it)}">${nm(it)}${it.n > 1 ? ' ×' + it.n : ''}</b> no chão — some em 30 s (E para pegar de volta).`); return done();
  }
  if (t === 'fadd') {
    const nm = String(m.name || '').trim().slice(0, 16); if (!nm) return fail();
    c.fr = Array.isArray(c.fr) ? c.fr : []; const k = nm.toLowerCase();
    if (k === String(c.name || '').toLowerCase()) return fail('Você não pode adicionar a si mesmo');
    if (c.fr.some(x => String(x).toLowerCase() === k)) return fail(nm + ' já está na sua lista');
    if (c.fr.length >= 50) return fail('Lista de amigos cheia (50)');
    c.fr.push(nm); T('🤝 ' + nm + ' adicionado aos amigos'); F('ui'); return done();
  }
  if (t === 'fdel') { const k = String(m.name || '').toLowerCase(); c.fr = (Array.isArray(c.fr) ? c.fr : []).filter(x => String(x).toLowerCase() !== k); T('Amigo removido'); return done(); }
  if (t === 'org') { organizeList(c.inv, c.cls); T('🧹 Mochila organizada'); return done(); }
  if (t === 'orgs') { if (!npcFor('bau')) return fail('Chegue perto do Baú.'); organizeList(stash, c.cls); T('🧹 Baú organizado'); return done(); }
  if (t === 'sell' || t === 'sellmany') {
    if (!npcFor('vender')) return fail('Chegue perto de um comerciante.');
    const idx = t === 'sell' ? [m.i] : (Array.isArray(m.idx) ? [...new Set(m.idx)] : []);
    let total = 0, n = 0;
    for (const i of idx) { if (!intIn(i, 0, c.inv.length) || !c.inv[i]) continue; const it = c.inv[i], q = (t === 'sell' && !m.all && it.n > 1) ? 1 : (it.n || 1);
      total += sellPrice(it) * q; n++; if (t === 'sell' && !m.all && it.n > 1) it.n--; else c.inv[i] = null; }
    if (!n) return fail('Nada para vender.'); c.gold += total; F('coin');
    if (t === 'sellmany') { L(`💰 Você vendeu <b>${n}</b> item(ns) por <b style="color:#ffe28a">${total}</b> ouro.`); T('Vendido: ' + n + ' item(ns) por ' + total + ' 💰'); }
    return done();
  }
  if (t === 'buy') {
    if (!npcFor('comprar')) return fail('Chegue perto de um comerciante.');
    const sh = (SHOPS[npcById(m.npc).shop || 'aurora'] || []).find(x => x.id === m.id); if (!sh) return fail();
    if (sh.f && !sh.f(c)) return fail();
    const cost = sh.c(c); if (c.gold < cost) return fail('Ouro insuficiente');
    const it = sh.mk(c); if (!canAdd(c.inv, it)) return fail('Mochila cheia!'); c.gold -= cost; addItem(c.inv, it); F('coin');
    if (sh.box) { T('Você abriu: ' + nm(it)); L(`🎁 A caixa continha <b style="color:${colOf(it)}">${nm(it)}</b>`); if (it.rar >= 2) F('rare'); } return done();
  }
  if (t === 'buyticket') {
    const n = npcFor('dungeon'); if (!n) return fail('Chegue perto do Guardião das Criptas.');
    const dg = DUNGEONS.find(x => x.id === m.id); if (!dg) return fail();
    if (c.level < dg.minLevel) return fail('Nível ' + dg.minLevel + ' necessário.');
    c.tix = c.tix || {}; if ((c.tix[dg.id] || 0) >= 5) return fail('Você já tem 5 ingressos.');
    if (c.gold < dg.price) return fail('Ouro insuficiente');
    c.gold -= dg.price; c.tix[dg.id] = (c.tix[dg.id] || 0) + 1; F('coin'); T('🎟️ Ingresso comprado: ' + dg.name);
    L(`🎟️ Você comprou um ingresso para <b style="color:#ffd27a">${dg.name}</b>. Vá até a entrada, no canto do deserto, e fale com o portal.`); return done();
  }
  if (t === 'craft') {
    const sm = npcFor('forja'); if (!sm) return fail('Chegue perto do Ferreiro.');
    const r = RECIPES.find(x => x.id === m.id); if (!r || (r.cls && r.cls !== c.cls) || (r.at || 'ferreiro') !== sm.id) return fail();
    if (!Object.keys(r.ing).every(k => have(c, k) >= r.ing[k]) || c.gold < r.gold) return fail('Materiais ou ouro insuficientes');
    const o = r.out(c.cls); if (!canAdd(c.inv, o)) return fail('Mochila cheia!');
    for (const k in r.ing) take(c, k, r.ing[k]); c.gold -= r.gold; addItem(c.inv, o); F('forge'); T('Forjado: ' + nm(o) + (o.n > 1 ? ' ×' + o.n : ''));
    L(`🔨 Você forjou <b style="color:${colOf(o)}">${nm(o)}</b>`); return done();
  }
  if (t === 'up') {
    if (!npcFor('aprimorar')) return fail('Chegue perto do Ferreiro.');
    const ref = String(m.ref || ''); let it = null;
    if (ref.startsWith('eq:')) it = validKey(ref.slice(3)) && c.eq[ref.slice(3)]; else if (ref.startsWith('inv:')) { const i = +ref.slice(4); it = intIn(i, 0, c.inv.length) ? c.inv[i] : null; }
    if (!it || it.k !== 'eq') return fail(); if (it.slot === 'cape') return fail('Capas não podem ser aprimoradas — elas brilham junto com a armadura.'); if ((it.plus || 0) >= MAXPLUS) return fail(); const k = upCost(it);
    if (have(c, 'ferro') < k.ferro || have(c, 'essencia') < k.essencia || c.gold < k.gold) return fail('Materiais ou ouro insuficientes');
    take(c, 'ferro', k.ferro); if (k.essencia) take(c, 'essencia', k.essencia); c.gold -= k.gold; const p = it.plus || 0;
    if (Math.random() < upRate(p)) { F('upOk'); it.plus = p + 1; T('✨ Sucesso! ' + nm(it)); L(`<span style="color:#6fdc7f">⬆️ ${it.name} aprimorado para +${it.plus}!</span>`); }
    else { F('upFail'); if (p >= 5) { it.plus = p - 1; T('💥 Falhou! O item perdeu 1 nível'); L(`<span style="color:#ff6b6b">💥 Falha no aprimoramento! ${it.name} caiu para +${it.plus}.</span>`); } else { T('Falhou, mas o item está intacto'); L('<span style="color:#ffb86b">Falha no aprimoramento (item intacto).</span>'); } }
    return done();
  }
  if (t === 'dep' || t === 'wd') {
    if (!npcFor('bau')) return fail('Chegue perto do Baú.');
    if (t === 'dep') { if (!intIn(m.i, 0, c.inv.length)) return fail(); const it = c.inv[m.i]; if (!it) return fail(); if (!canAdd(stash, it)) return fail('Baú cheio!'); c.inv[m.i] = null; if (!addItem(stash, it)) { c.inv[m.i] = it; return fail('Baú cheio!'); } return done(); }
    if (!intIn(m.i, 0, stash.length)) return fail(); const it = stash[m.i]; if (!it) return fail(); stash[m.i] = null; if (!addItem(c.inv, it)) { stash[m.i] = it; return fail('Mochila cheia!'); } return done();
  }
  if (t === 'qa' || t === 'qt') {
    const q = QUESTS.find(x => x.id === m.id); if (!q) return fail(); const n = npcById(q.npc); if (ctx && ctx.near && !ctx.near(n)) return fail('Chegue perto do NPC.');
    const list = QUESTS.filter(x => x.npc === q.npc), qi = list.indexOf(q);
    if (!(qi === 0 || (c.quests[list[qi - 1].id] && c.quests[list[qi - 1].id].done))) return fail();
    const st = c.quests[q.id];
    if (t === 'qa') { if (st) return fail(); c.quests[q.id] = { n: 0, done: false }; F('questAccept'); T('Missão aceita!'); return done(); }
    if (!st || st.done || st.n < q.qty) return fail();
    st.done = true; F('questDone'); c.gold += q.rw.gold; if (q.rw.sp) c.sp += q.rw.sp;
    const give = it => { if (!addItem(c.inv, it)) spawn.push({ item: it, life: 0 }); };
    if (q.rw.pot) give({ k: 'pot', id: 'hp', n: q.rw.pot.hp }); if (q.rw.eq) give(genItem(q.rw.eq.slot, q.rw.eq.ilvl, q.rw.eq.rar, c.cls, c.cls, 0, true));
    L(`<span style="color:#6fdc7f">📜 Missão "${q.t}" concluída! Recompensa recebida.</span>`); T('Missão entregue!');
    if (gainXp(c, q.rw.xp)) out.push({ lvl: c.level }); return done();
  }
  if (t === 'died') {
    const loss = Math.floor(xpNeed(c.level) * .05); c.xp = Math.max(0, c.xp - loss);
    L(`<span style="color:#ff6b6b">Você morreu e perdeu ${loss} XP.</span>`); return done();
  }
  return fail();
}

Object.assign(R, { GM_GOLD, gmChar, titleList, titleInfo, titleHave, dgDone, brightProg, MAXPLUS, TCOL, genCape, isMag, capeKind, CAPEWHO, CPN, CMN, defBar, cleanBar, skCost, luckOf, canSkillUp, OG, keyBase, validKey, eqKey, apOf, originFor, BRN, ERN, DUNGEONS, dgChestLoot, xpNeed, PTS_PER_LEVEL, MAX_LEVEL, GOLD_CAP_PER_LEVEL, XN, RAR, SLOTS, STN, WN, AN, HN, BN, RN, SHN, SUF, MATS, POTS, MAXRANK, CLASSES, MT, ZONES, QUESTS, QNAME, RECIPES, NPCS,
  SHOPS, eff, nm, sellPrice, upRate, upCost, slotPool, rarRoll, genItem, canAdd, addItem, have, take, stats, skStat, hitDamage, xpFor, rollLoot, gainXp, questKill, newChar, cleanItem, migrate, migrateStash, act, npcById });
root.RULES = R;
if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
