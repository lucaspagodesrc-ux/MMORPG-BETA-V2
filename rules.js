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
const fmtN = n => Number(n).toLocaleString('pt-BR');

/* ---------- BALANCEAMENTO (versão 0.8) ---------- */
const PTS_PER_LEVEL = 3;                    // pontos de atributo por nível (antes: 5)
const GOLD_CAP_PER_LEVEL = 3000;            // (legado) não limita mais o ouro
const GOLD_MAX = 1e12;                      // teto técnico de ouro por personagem
const MAX_LEVEL = 170;
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
{const fem=n=>/^(Armadura|Espada|Adaga)/.test(n),pl=n=>/^Botas/.test(n);
 const ext=a=>{const l=a[a.length-1];a.push(l.replace('Imortais','Glaciais').replace('Imortal','Glacial'));a.push(l.replace('Imortais','Eternas').replace('Imortal',fem(l)?'Eterna':'Eterno'));};
 for(const k in XN){if(Array.isArray(XN[k]))ext(XN[k]);else for(const c in XN[k])ext(XN[k][c]);}}
const SUF=['do Dragão','da Tempestade','da Sombra','do Titã','da Aurora','do Lobo'];
const MATS={pelepolar:{n:'Pelagem Polar',i:'🤍',v:280},runabar:{n:'Runa Bárbara',i:'🔰',v:330},ossogelo:{n:'Osso Congelado',i:'❄️',v:380},fiocristal:{n:'Fio de Cristal',i:'🕸️',v:430},coracaogelo:{n:'Coração de Gelo',i:'💙',v:560},essenciagelo:{n:'Essência Glacial',i:'🔷',v:640},nucleogelo:{n:'Núcleo Glacial',i:'💠',v:2200},cristalpuro:{n:'Cristal Eterno',i:'💎',v:2800},escamagelo:{n:'Escama Glacial',i:'🐲',v:4500},gosma:{n:'Gosma Viscosa',i:'🟢',v:2},couro:{n:'Couro de Lobo',i:'🟤',v:4},ferro:{n:'Minério de Ferro',i:'⛏️',v:6},osso:{n:'Osso Antigo',i:'🦴',v:8},essencia:{n:'Essência Arcana',i:'✨',v:20},erva:{n:'Erva Verde',i:'🌿',v:3},nucleo:{n:'Núcleo de Golem',i:'💠',v:150},
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
   {n:'Golpe Poderoso',i:'💥',lv:1,cd:5,cdMin:5,mp:8,type:'stab3',mult:.75,range:3.6,anim:'stab',color:'#ffcf6b',d:'Três estocadas rápidas para a frente (o dano total continua o mesmo, dividido nas 3 estocadas).'},
   {n:'Giro de Lâmina',i:'🌀',lv:3,cd:10,cdMin:10,mp:14,type:'aoeSelf',mult:1.5,radius:3.6,anim:'spin',color:'#ffd27a',d:'O personagem gira com a lâmina golpeando todos ao redor.'},
   {n:'Investida',i:'⚡',lv:5,cd:8,mp:12,type:'dash',mult:1.8,range:10,color:'#8fd3ff',d:'Avança até o alvo e ataca.'},
   {n:'Grito de Guerra',i:'📣',lv:8,cd:60,cdMin:60,mp:20,type:'buff',buffs:{dmg:.35,shield:.15},dur:12,color:'#ff9f5a',d:'+35% dano e -15% dano recebido. Recarga: 60s.'},
   {n:'Terremoto',i:'🌋',lv:12,cd:10,cdMin:10,mp:28,type:'aoeSelf',mult:2.2,radius:5,slow:3000,color:'#c9a56b',d:'Finca a espada no chão: dano em área e lentidão.'},
   {n:'Sangue de Guerra',i:'🩸',lv:15,cd:60,cdMin:60,mp:25,type:'heal',pct:.35,buffs:{dmg:.1},fixBuff:1,dur:20,fixDur:1,color:'#ff6b6b',d:'Auto buff: recupera 35% da vida máxima e dá +10% de dano base por 20s.'},
   {n:'Fúria do Bárbaro',i:'😡',lv:20,cd:60,cdMin:60,mp:35,type:'transform',buffs:{haste:.2,aspd:.5,crit:.1,flat:10,dmg:.2},flatMin:10,flatMax:100,fixBuff:1,dur:10,fixDur:1,color:'#d83a2a',d:'Forma bárbara por 10s: o personagem fica maior, exala fumaça vermelha e a espada pega fogo. +10 de dano base no nível 1 (até +100 no nível 20), +20% de dano, +10% de crítico, +50% de velocidade de ataque e +20% de velocidade de movimento. Só o ataque básico funciona nessa forma.'},
   {n:'Trovão',i:'🌩️',lv:25,cd:45,cdMin:45,mp:40,type:'thunder',mult:6,range:8,radius:4.5,dot:240,dotDur:8,anim:'sky',color:'#bfe3ff',d:'Aponta a espada para o céu e faz cair um raio no alvo: dano em área e depois dano contínuo de 240 por segundo durante 8s nos atingidos.'}]}, arqueiro:{n:'Arqueiro',i:'🏹',wi:'🏹',main:'agi',base:{str:4,agi:11,int:3,vit:6},range:9.5,ranged:true,proj:'arrow',pcol:'#e8e0b0',
  d:'Ataque à distância. Crítico alto e mobilidade.',
  skills:[
   {n:'Tiro Preciso',i:'🎯',lv:1,cd:3,mp:8,type:'single',mult:2.3,range:11,proj:'arrow',color:'#fff2a8',d:'Disparo certeiro em um alvo.'},
   {n:'Chuva de Flechas',i:'🌧️',lv:3,cd:7,mp:16,type:'aoeTarget',arr:1,mult:1.3,radius:3.4,range:11,color:'#e8e0b0',d:'Chuva de flechas na área do alvo.'},
   {n:'Tiro Explosivo Evasivo',i:'💥',lv:5,cd:8,mp:10,type:'dashBack',blast:1,anim:'blast',dist:7,buffs:{haste:.5},dur:4,color:'#9fe7b0',d:'Crava uma flecha explosiva no chão e é lançado para trás pela explosão, ganhando rapidez.',fx:'wind'},
   {n:'Foco Mortal',i:'👁️',lv:8,cd:22,mp:18,type:'buff',spirit:1,buffs:{crit:.35,dmg:.2},dur:10,color:'#ff7a7a',d:'+35% crítico e +20% dano.'},
   {n:'Vontade do Vento',i:'🍃',lv:12,cd:9,mp:24,type:'multi',fan:1,hits:3,mult:1.2,range:11,proj:'arrow',color:'#bff5c8',d:'Um leque de flechas de vento atinge o alvo de uma vez (mais flechas a cada poucos ranks).',fx:'wind'},
   {n:'Rajada Reunidora',i:'🌪️',lv:15,cd:10,mp:22,type:'chainPull',gust:1,mult:1.4,range:11,radius:5,cnt:5,stun:1500,pvpStun:700,color:'#9fe7d0',d:'Uma flecha de vento abre um redemoinho que junta até 5 monstros no centro e os atordoa por 1,5s.',fx:'wind'},
   {n:'Tempestade de Flechas',i:'⛈️',lv:20,cd:18,mp:40,type:'aoeTarget',arr:2,mult:2.3,radius:5.2,range:11,color:'#e8e0b0',d:'Uma tempestade de flechas em grande área.'},
   {n:'Flecha Dilacerante',i:'🗡️',lv:25,cd:22,mp:45,type:'single',charge:1,pre:300,anim:'charge',mult:6.5,range:13,proj:'arrow',color:'#ff7a7a',d:'Concentra energia no arco e solta uma flecha perfurante de altíssimo dano.',fx:'shadow'}]},
 mago:{n:'Mago',i:'🪄',wi:'🪄',main:'int',base:{str:2,agi:4,int:11,vit:5},range:9,ranged:true,proj:'orb',pcol:'#9fc4ff',
  d:'Magia devastadora. Frágil, mas com enorme dano.',
  skills:[
   {n:'Bola de Fogo',i:'🔥',lv:1,cd:3,mp:10,type:'single',mult:2.4,range:10.5,proj:'big',color:'#ff8a3d',d:'Esfera flamejante em um alvo.'},
   {n:'Nova Gélida',i:'❄️',lv:3,cd:8,mp:18,type:'aoeSelf',mult:1.4,radius:4.2,slow:3500,fxMon:1,color:'#8fe3ff',d:'Explosão de gelo lançada sobre os monstros ao redor, que retarda os inimigos.'},
   {n:'Escudo Arcano',i:'🔮',lv:5,cd:45,cdMin:45,mp:20,type:'buff',buffs:{shield:.35,dmg:.2},fixBuff:1,dur:10,fixDur:1,color:'#c79bff',d:'Por 10s: reduz 35% do dano recebido e aumenta em 20% o seu dano.'},
   {n:'Meteoro',i:'☄️',lv:8,cd:18,mp:45,type:'aoeTarget',meteor:true,mult:3.4,radius:4,range:11,color:'#ff6a2a',d:'Um meteoro devastador na área.'},
   {n:'Raio Arcano',i:'⚡',lv:12,cd:8,mp:26,type:'arcRay',mult:3,range:10.5,radius:3.5,dot:200,dotDur:4,slow:3000,color:'#9fc4ff',d:'Um raio arcano vai até os monstros: dano em área, 200 de dano por segundo durante 4s e lentidão.'},
   {n:'Cura Arcana',i:'💚',lv:15,cd:28,mp:30,type:'heal',pct:.6,fixPct:1,hot:50,hotDur:5,color:'#6fdc7f',d:'Recupera 60% da vida máxima e depois cura 50 de vida por segundo durante 5s.'},
   {n:'Tempestade de Gelo',i:'🌨️',lv:20,cd:16,mp:50,type:'aoeTarget',mult:2.4,radius:5.5,range:11,slow:3500,stun:1500,fixStun:1,ice:1,color:'#8fe3ff',d:'Nevasca em grande área: pedras de gelo prendem os monstros atingidos, petrificando-os por 1,5s.'},
   {n:'Apocalipse',i:'🌠',lv:25,cd:40,mp:90,type:'aoeTarget',meteor:true,balls:3,gap:420,mult:7,radius:6.5,range:12,color:'#ff3a2a',d:'Três bolas de fogo caem em sequência, pela diagonal, na área (dano total mantido).'}]},
 assassino:{n:'Assassino',i:'🥷',wi:'🔪',main:'agi',base:{str:4,agi:12,int:4,vit:5},range:2.4,ranged:false,combo:true,
  d:'Lâminas e sombras. +30% vel. de ataque, +12% crítico, -10% vida. Encadeie habilidades em COMBOS: bônus de dano, mana de volta e recargas reiniciadas.',
  skills:[
   {n:'Corte Rápido',i:'🔪',lv:1,cd:2.5,mp:6,type:'single',mult:2.0,range:3.4,color:'#c79bff',anim:'both',after:[1,3],cbonus:.4,d:'Corte veloz com as duas lâminas (os dois braços golpeiam). COMBO após Passo Sombrio ou Dança das Lâminas.'},
   {n:'Passo Sombrio',i:'💨',lv:3,cd:7,mp:12,type:'dash',mult:1.2,range:10,color:'#8f7aff',d:'Teleporta até o alvo e ataca. Abertura de combo.'},
   {n:'Chuva de Adagas',i:'🗡️',lv:5,cd:8,mp:16,type:'daggerFan',mult:.7,range:8,dagMin:1,dagMax:5,color:'#e0c4ff',after:[1,0],cbonus:.5,d:'Lança adagas em leque (1 no nível 1, até 5 no nível máximo), com dano em área. Elas ficam presas no chão por 2s e voltam ao personagem causando dano de novo. Use a habilidade de novo enquanto estiverem presas para chamá-las de volta na hora. COMBO após Passo Sombrio ou Corte Rápido.'},
   {n:'Dança das Lâminas',i:'🌪️',lv:8,cd:9,mp:18,type:'aoeSelf',mult:1.6,radius:3.8,color:'#ff7ad9',anim:'spin',after:[0,1,2],cbonus:.6,reset:[1],d:'O personagem gira com as lâminas, ferindo todos em volta. COMBO reinicia o Passo Sombrio.'},
   {n:'Marca da Morte',i:'🎯',lv:12,cd:14,mp:20,type:'mark',mult:0,range:9,mark:6,color:'#ff4a6a',after:[3],cbonus:.3,d:'Não causa dano: apenas marca o monstro. Alvo marcado recebe +35% de dano por 6s.'},
   {n:'Véu Sombrio',i:'🌑',lv:15,cd:30,mp:25,type:'buff',buffs:{evade:.35,crit:.3,haste:.3},dur:8,color:'#7a6aff',d:'+35% esquiva, +30% crítico e +30% velocidade.'},
   {n:'Manto Fumaça',i:'🌫️',lv:20,cd:30,mp:30,type:'cloak',buffs:{haste:.4},fixBuff:1,dur:10,fixDur:1,color:'#e8eef5',d:'Um manto branco e fumaça envolvem o personagem: fica semi transparente, +40% de velocidade e invisível para os monstros por 10s. Não causa dano.'},
   {n:'Estrela Sombria',i:'⭐',lv:25,cd:20,cdMin:20,mp:60,type:'starJump',jumps:5,mult:1.6,range:12,color:'#9a7bff',d:'Pula em até 5 monstros, um após o outro, causando dano em cada um e desenhando uma estrela negra no chão.'}]},
 cavaleiro:{n:'Cavaleiro Pesado',i:'🛡️',wi:'🗡️',main:'str',base:{str:8,agi:3,int:3,vit:13},range:2.6,ranged:false,
  d:'Espada e escudo. Defesa +40% e vida +15%. Converte defesa em dano.',
  skills:[
   {n:'Golpe de Escudo',i:'🛡️',lv:1,cd:3,mp:8,type:'single',mult:1.2,defMult:1.0,range:3.2,anim:'shield',color:'#9fc4ff',d:'Golpe com o escudo: o braço do escudo bate no alvo. Dano + parte da sua DEFESA.'},
   {n:'Investida do Escudo',i:'🐂',lv:3,cd:8,mp:12,type:'dash',mult:1.2,defMult:.8,range:10,color:'#8fd3ff',d:'Avança com o escudo e converte defesa em dano.'},
   {n:'Postura Defensiva',i:'🏰',lv:5,cd:60,cdMin:35,mp:18,type:'buff',buffs:{shield:.35},dur:60,fixDur:1,color:'#7fa6d9',d:'Auto-buff (só em você) por 1 minuto: -35% de dano recebido. Recarga: 60s no rank 1 até 35s no rank máximo.'},
   {n:'Bastião',i:'⚙️',lv:8,cd:120,cdMin:90,mp:25,type:'buff',buffs:{defdmg:.6,defloss:.6},fixBuff:1,dur:60,fixDur:1,color:'#ffd27a',d:'Auto-buff por 1 minuto: converte 60% da sua DEFESA em força (a defesa cai 60% e todo ataque ganha esse valor como dano). Recarga: 120s no rank 1 até 90s no máximo.'},
   {n:'Hell Crasher',i:'🛡️',lv:12,cd:12,mp:28,type:'aoeSelf',mult:.8,defMult:1.5,radius:4.5,slow:3000,anim:'jump',delay:650,crest:1,color:'#ffb347',d:'Salta bem alto e crava o escudo no chão, marcando um enorme brasão de escudo em chamas: dano em área baseado na DEFESA e lentidão.'},
   {n:'Vontade de Ferro',i:'🩹',lv:15,cd:60,cdMin:60,mp:25,type:'heal',pct:.3,color:'#6fdc7f',d:'Recupera 30% da vida máxima.'},
   {n:'Escudo Voador',i:'🥏',lv:20,cd:24,mp:40,type:'shieldThrow',mult:1.3,defMult:1.0,range:8,fspd:24,spin:.8,pierce:.5,anim:'throw',color:'#9fd0ff',d:'Arremessa o escudo para frente, ferindo (perfurante) todos que acertar. No alcance máximo ele gira por um instante causando dano em área e volta rápido para você. Sem escudo enquanto ele voa.'},
   {n:'Raio do Escudo',i:'🔆',lv:25,cd:22,mp:45,type:'shieldBeam',mult:.9,defMult:1.6,range:15,pierce:.5,dur:1.5,beam:1.5,anim:'beam',color:'#fff2a8',d:'Bate a espada no escudo e solta um raio concentrado por 1,5s à frente, causando dano perfurante em tudo que ele atravessa.'},
   {n:'Égide do Guardião',i:'🔰',lv:30,cd:60,cdMin:60,mp:50,type:'buff',ward:3000,dur:30,fixDur:1,color:'#7fd8ff',d:'Cria um escudo que absorve 3000 de dano por 30s: você só perde vida depois que o escudo quebrar. Em grupo, todos os membros próximos também recebem o escudo. Funciona na Arena PK; não funciona em duelo (é cancelado quando o duelo começa).'}]},
 tanque:{n:'Tanque',i:'⛓️',wi:'🔨',main:'vit',base:{str:6,agi:2,int:2,vit:14},range:2.8,ranged:false,
  d:'O mais resistente: DEFESA +75%, vida +30%. Puxa, atordoa, imobiliza, levanta e PROVOCA os monstros para levar o dano.',
  skills:[
   {n:'Gancho de Corrente',i:'⛓️',lv:1,cd:7,mp:10,type:'single',mult:.9,range:10,proj:'hook',pull:true,stun:1200,color:'#9fb4c8',d:'Arremessa o gancho, PUXA o alvo até você e o atordoa.'},
   {n:'Pisão Sísmico',i:'🦶',lv:3,cd:9,mp:14,type:'aoeSelf',mult:.5,radius:4,stun:1000,anim:'stomp',color:'#c9a56b',d:'Pisa com força: pedras sobem do chão e o chão racha (efeito de 2s). Dano em área e ATORDOA os inimigos.'},
   {n:'Provocar',i:'📢',lv:5,cd:16,mp:16,type:'taunt',radius:9,buffs:{shield:.35},dur:8,color:'#ff7a5a',d:'Provoca todos ao redor: eles passam a te focar. -35% de dano recebido.'},
   {n:'Correntes de Aço',i:'🔗',lv:8,cd:13,mp:22,type:'chainPull',mult:.4,range:10,radius:6,cnt:5,stun:3000,pvpStun:1000,color:'#8fb0d0',d:'Lança correntes que prendem até 5 monstros e os juntam no centro, atordoando-os por 3s (1s em jogadores, quando o PvP existir).'},
   {n:'Golpe Ascendente',i:'⏫',lv:12,cd:15,mp:28,type:'aoeSelf',mult:.8,radius:4.5,lift:1600,delay:600,anim:'sumo',color:'#ffd27a',d:'Bate mãos e pés no chão como um lutador de sumô e lança os inimigos para o alto, atordoados. Alvos com esquiva alta podem escapar.'},
   {n:'Muralha de Ferro',i:'🧱',lv:15,cd:180,cdMin:180,cdAlly:360,mp:30,type:'buff',ally:1,buffs:{shield:.5,evade:.1},evMin:.1,evMax:.3,fixBuff:1,dur:20,fixDur:1,color:'#7fa6d9',d:'Buff de 20s: -50% de dano recebido e +10% de esquiva (até +30% no nível máximo). Recarga 180s. Também pode ser lançada em outro jogador (clique no personagem dele), com recarga de 360s.'},
   {n:'Sentença do Colosso',i:'🗿',lv:25,cd:40,mp:55,type:'roll',mult:.6,radius:2.4,range:10,dur:4,fixDur:1,stun:500,color:'#fff2a8',d:'Rola pelo mapa por 4s batendo nos monstros. Ao bater em parede, pedra ou árvore, ricocheteia e muda de sentido.'}]}, pierrot:{n:'Pierrot',i:'🤡',wi:'🤺',main:'agi',base:{str:3,agi:12,int:4,vit:4},range:2.6,ranged:false,
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
 lobo:{n:'Lobo Cinzento',eva:0.3,lv:[4,6],hp:110,atk:11,def:4,spd:3.2,xp:60,gold:[4,8],aggro:8,rng:1.9,atkInt:1300,resp:12,leash:18,h:1.8,mats:{couro:0.468,erva:0.170,essencia:0.043},eq:0.060,pot:0.048},
 goblin:{n:'Goblin Saqueador',lv:[7,9],hp:200,atk:18,def:10,spd:2.9,xp:138,gold:[7,17],aggro:8,rng:1.8,atkInt:1400,resp:13,leash:18,h:2.4,mats:{ferro:0.425,couro:0.212,essencia:0.060},eq:0.084,pot:0.060},
 esqueleto:{n:'Esqueleto Amaldiçoado',lv:[10,12],hp:330,atk:28,def:18,spd:2.6,xp:236,gold:[15,33],aggro:8,rng:1.9,atkInt:1500,resp:14,leash:18,h:2.6,mats:{osso:0.468,ferro:0.255,essencia:0.085},eq:0.108,pot:0.060},
 espantalho:{n:'Espantalho de Treino',lv:[1,1],hp:3000000,atk:0,def:0,spd:0,xp:0,gold:[0,0],aggro:0,rng:0,atkInt:99999,resp:.4,leash:1,h:2.9,dummy:true,mats:{},eq:0,pot:0},
 golem:{n:'Golem Ancião',lv:[15,15],hp:3200,atk:62,def:35,spd:2.0,xp:4259,gold:[180,300],aggro:9,rng:3.0,atkInt:1800,resp:150,leash:20,h:5.2,boss:true,mats:{nucleo:1,ferro:1,essencia:1},matMax:3,eq:1,pot:1,rb:3},
 aranha:{n:'Aranha Gigante',eva:0.3,lv:[13,15],hp:520,atk:40,def:24,spd:3.4,xp:347,gold:[24,54],aggro:8,rng:1.9,atkInt:1200,resp:14,leash:18,h:2.0,mats:{seda:0.468,osso:0.170,essencia:0.102},eq:0.120,pot:0.060},
 orc:{n:'Orc Guerreiro',lv:[16,18],hp:900,atk:58,def:34,spd:2.9,xp:470,gold:[42,84],aggro:8,rng:2.1,atkInt:1500,resp:15,leash:18,h:3.2,mats:{presa:0.425,ferro:0.340,essencia:0.119},eq:0.132,pot:0.060},
 yeti:{n:'Yeti das Montanhas',lv:[19,21],hp:1500,atk:80,def:45,spd:2.8,xp:603,gold:[72,132],aggro:8,rng:2.4,atkInt:1600,resp:16,leash:18,h:3.6,mats:{cristal:0.425,couro:0.255,essencia:0.128},eq:0.144,pot:0.060},
 demonio:{n:'Demônio Flamejante',lv:[22,24],hp:2300,atk:110,def:60,spd:3.2,xp:744,gold:[120,216],aggro:9,rng:2.2,atkInt:1400,resp:18,leash:20,h:3.4,mats:{brasa:0.425,osso:0.255,essencia:0.170},eq:0.156,pot:0.072},
 dragao:{n:'Dragão Rubro',lv:[28,28],hp:14000,atk:190,def:90,spd:2.6,xp:20452,gold:[1200,1800],aggro:10,rng:4.6,atkInt:1800,resp:400,leash:24,h:8,boss:true,mats:{escama:1,brasa:1,essencia:1},matMax:3,eq:1,pot:1,rb:3},
 // ===== Solara (deserto) — níveis 50 a 75 =====
 escorpiao:{n:'Escorpião Gigante',eva:0.2,lv:[50,53],hp:2800,atk:330,def:70,spd:3.3,xp:4414,gold:[228,390],aggro:8,rng:2.0,atkInt:1300,resp:14,leash:18,h:2.4,mats:{ferrao:0.468,linho:0.170,essencia:0.170},eq:0.132,pot:0.060},
 mumia:{n:'Múmia Ancestral',lv:[54,57],hp:3400,atk:370,def:85,spd:2.5,xp:4774,gold:[288,492],aggro:8,rng:2.0,atkInt:1500,resp:14,leash:18,h:3.2,mats:{linho:0.468,ankh:0.128,essencia:0.187},eq:0.138,pot:0.060},
 cobra:{n:'Naja Dourada',eva:0.25,lv:[58,61],hp:3600,atk:420,def:80,spd:3.8,xp:5143,gold:[360,600],aggro:9,rng:2.2,atkInt:1200,resp:14,leash:18,h:3.0,mats:{veneno:0.468,cristalsol:0.170,essencia:0.212},eq:0.144,pot:0.060},
 elemental:{n:'Elemental de Areia',lv:[62,65],hp:4600,atk:450,def:110,spd:2.9,xp:5521,gold:[450,750],aggro:8,rng:2.4,atkInt:1500,resp:15,leash:18,h:3.6,mats:{cristalsol:0.425,veneno:0.170,essencia:0.238},eq:0.150,pot:0.060},
 chacal:{n:'Guardião Chacal',eva:0.3,lv:[66,69],hp:5400,atk:500,def:120,spd:3.1,xp:5906,gold:[540,900],aggro:9,rng:2.3,atkInt:1400,resp:16,leash:20,h:3.6,mats:{garra:0.425,ankh:0.212,essencia:0.255},eq:0.156,pot:0.060},
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
  id:'cripta', name:'Cripta das Areias Esquecidas', icon:'🏺', reg:300, minLevel:50, price:50000, time:2400, ilvl:[52,58], cx:600, grace:300,
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
Object.assign(OG,{
 lobo_polar:{sf:'do Lobo Polar',col:'#e8f2ff',col2:'#9ab4d0',el:'ice',ft:'ears'},
 barbaro:{sf:'do Bárbaro',col:'#9fc4e8',col2:'#4a6a8a',el:'ice',ft:'tusks'},
 esq_gelo:{sf:'do Congelado',col:'#aee8ff',col2:'#5a9ac0',el:'ice',ft:'skull'},
 aranha_cristal:{sf:'do Cristal',col:'#c8f0ff',col2:'#6aa8d0',el:'ice',ft:'crystals'},
 yeti_anciao:{sf:'do Yeti Ancião',col:'#ffffff',col2:'#9fcaf0',el:'ice',ft:'fur'},
 espectro:{sf:'do Espectro',col:'#8fe0ff',col2:'#3a78b8',el:'soul',ft:'horns'},
 golem_gelo:{sf:'do Golem Eterno',col:'#9fd8ff',col2:'#3a6a90',el:'ice',ft:'rock'},
 yeti_rei:{sf:'do Yeti Rei',col:'#e0f0ff',col2:'#78a8d8',el:'ice',ft:'crown'},
 dragao_gelo:{sf:'do Dragão Glacial',col:'#7fd0ff',col2:'#1f4a80',el:'ice',ft:'spikes'}});
OG.wb_a={sf:'da Rainha Gosma',col:'#7be58f',col2:'#2f8f4a',el:'poison',ft:'crown'};
OG.wb_s={sf:'do Escorpião-Rei',col:'#ffcf6a',col2:'#a8741a',el:'gold',ft:'stinger'};
OG.wb_n={sf:'do Wendigo',col:'#bfe6ff',col2:'#5a8ab8',el:'ice',ft:'horns'};
OG.dg_a=OG.mumia;OG.dg_b=OG.escorpiao;OG.dg_c=OG.chacal;OG.dg_d=OG.cobra;OG.dg_s1=OG.colosso;OG.dg_s2=OG.sacerdote;OG.dg_boss=OG.farao;
for(const k in MT)MT[k].id=k;
const DUPKEY={ring:1,bracelet:1,earring:1};
const keyBase=k=>String(k).replace(/2$/,'');
const validKey=k=>!!SLOTS[keyBase(k)]&&(k===keyBase(k)||!!DUPKEY[k.slice(0,-1)]);

/* ===== Nevasca (neve) — níveis 75 a 100 ===== */
const snMob=(base,o)=>{const L=(o.lv[0]+o.lv[1])/2,k=L-72,B0=MT[base];return Object.assign({},B0,{model:base,eva:B0.eva||0,boss:false,hp:Math.round(6200+k*330),atk:Math.round(540+k*14),def:Math.round(130+k*3.8),xp:Math.round(xpNeed(L)/55),gold:[Math.round(660+k*30),Math.round(1080+k*45)],aggro:9,resp:15,leash:20,eq:.17,pot:.07,mats:{}},o);};
const snBoss=(base,o)=>{const L=o.lv[0],k=L-75;return Object.assign({},MT[base],{model:base,boss:true,hp:Math.round(110000+k*6500),atk:Math.round(900+k*16),def:Math.round(175+k*3.5),xp:Math.round(xpNeed(L)*.45),gold:[12000+k*500,18000+k*750],resp:400,leash:26,eq:1,pot:1,rb:3,matMax:3},o);};
Object.assign(MT,{
 lobo_polar:snMob('lobo',{n:'Lobo Polar',lv:[75,78],tint:'#eef6ff',sc:1.15,mats:{pelepolar:.45,essencia:.25}}),
 barbaro:snMob('orc',{n:'Bárbaro das Neves',lv:[79,82],tint:'#9fc4e8',mats:{runabar:.45,presa:.18,essencia:.28}}),
 esq_gelo:snMob('esqueleto',{n:'Esqueleto Congelado',lv:[83,86],tint:'#8fd8ff',mats:{ossogelo:.45,essencia:.30}}),
 aranha_cristal:snMob('aranha',{n:'Aranha de Cristal',lv:[87,90],tint:'#b8e8ff',mats:{fiocristal:.45,essencia:.32}}),
 yeti_anciao:snMob('yeti',{n:'Yeti Ancião',lv:[91,94],tint:'#ffffff',sc:1.25,mats:{coracaogelo:.40,cristal:.2,essencia:.34}}),
 espectro:snMob('demonio',{n:'Espectro Glacial',lv:[95,98],tint:'#7fd8ff',mats:{essenciagelo:.42,essencia:.36}}),
 golem_gelo:snBoss('golem',{n:'Golem de Gelo Eterno',lv:[88,88],tint:'#9fd8ff',sc:1.2,mats:{nucleogelo:1,cristalpuro:1,essencia:1}}),
 yeti_rei:snBoss('yeti',{n:'Yeti Rei',lv:[95,95],tint:'#cfe8ff',sc:1.6,rng:4,atkInt:1700,mats:{coracaogelo:1,cristalpuro:1,essencia:1}}),
 dragao_gelo:snBoss('dragao',{n:'Dragão Glacial',lv:[100,100],tint:'#8fd0ff',mats:{escamagelo:1,nucleogelo:1,cristalpuro:1,essencia:1}})
});
/* ===== CHEFES DE MUNDO: um por região, nascem em horários fixos numa arena marcada no mapa =====
   hp = vida-base (piso); o servidor soma a "cota" de cada jogador que entra na luta (ver worldboss.ts) */
const wbMob=(base,o)=>Object.assign({},MT[base],{model:base,boss:true,wb:true,eva:0,aggro:45,leash:95,resp:0,rb:3,eq:0,pot:0,matMax:4,spd:2.3},o);
Object.assign(MT,{
 wb_a:wbMob('slime',{n:'Rainha Gosma, a Colossal',lv:[34,34],hp:150000,atk:235,def:105,rng:4.6,atkInt:1900,h:7,tint:'#7be58f',sc:2.7,xp:Math.round(xpNeed(34)*.22),gold:[0,0],mats:{gosma:1,nucleo:1,essencia:1}}),
 wb_s:wbMob('escorpiao',{n:'Escorpião-Rei das Dunas',lv:[76,76],hp:300000,atk:1000,def:190,rng:4.8,atkInt:1800,h:7,tint:'#ffcf6a',sc:3.0,xp:Math.round(xpNeed(76)*.2),gold:[0,0],mats:{obsidiana:1,selo:1,essencia:1}}),
 wb_n:wbMob('yeti',{n:'Wendigo Primordial',lv:[100,100],hp:450000,atk:1500,def:280,rng:5.2,atkInt:1700,h:11,tint:'#bfe6ff',sc:2.3,xp:Math.round(xpNeed(100)*.15),gold:[0,0],mats:{escamagelo:1,nucleogelo:1,cristalpuro:1,essencia:1}})});
for(const k in MT)MT[k].id=k;
/* ====================== CALABOUÇOS v2: várias salas, etapas e mecânicas próprias ======================
   Layout em GRADE de 2 m: rooms = retângulos [x0,z0,x1,z1] relativos ao centro cx; open = etapa em que a sala passa a ser acessível.
   Servidor e navegador usam o MESMO mapa (dgWalk) para decidir onde dá para andar; portões aparecem sozinhos onde duas salas de
   etapas diferentes se tocam. Etapas: kill • statue • boss • runes (ordem sorteada) • defend (altar) • waves (ondas) • crystals.
   Cada etapa pode ter perigos do ambiente: hz (círculos de aviso no chão) e cold (frio: só as fogueiras protegem).
   Chefes: mech = { rain, big, adds, shield, blink, nova, enrage } (ver dungeon.ts).                                            */
const DGCS = 2;
function dgGrid(def) {
  if (def._g) return def._g;
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const r of def.rooms) { x0 = Math.min(x0, r.b[0]); z0 = Math.min(z0, r.b[1]); x1 = Math.max(x1, r.b[2]); z1 = Math.max(z1, r.b[3]); }
  x0 -= DGCS * 2; z0 -= DGCS * 2; x1 += DGCS * 2; z1 += DGCS * 2;
  const w = Math.ceil((x1 - x0) / DGCS), h = Math.ceil((z1 - z0) / DGCS), a = new Uint8Array(w * h);
  for (const r of def.rooms) {
    const i0 = Math.round((r.b[0] - x0) / DGCS), i1 = Math.round((r.b[2] - x0) / DGCS), j0 = Math.round((r.b[1] - z0) / DGCS), j1 = Math.round((r.b[3] - z0) / DGCS);
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) { const k = j * w + i, v = r.open + 1; if (!a[k] || v < a[k]) a[k] = v; }
  }
  Object.defineProperty(def, '_g', { value: { cs: DGCS, x0, z0, w, h, a }, enumerable: false, writable: true });
  return def._g;
}
/** código da célula no ponto local (lx,lz): 0 = parede/vazio • n>0 = sala que abre na etapa n-1 */
function dgCell(def, lx, lz) { const g = dgGrid(def), i = Math.floor((lx - g.x0) / g.cs), j = Math.floor((lz - g.z0) / g.cs); return (i < 0 || j < 0 || i >= g.w || j >= g.h) ? 0 : g.a[j * g.w + i]; }
/** dá para pisar em (x,z) absolutos com a instância na etapa `stage`? m = folga (metade do corpo) */
function dgWalk(def, stage, x, z, m) {
  const lx = x - def.cx, ok = (a, b) => { const k = dgCell(def, a, b); return k > 0 && stage >= k - 1; };
  m = m || 0; return ok(lx, z) && (!m || (ok(lx - m, z - m) && ok(lx + m, z - m) && ok(lx - m, z + m) && ok(lx + m, z + m)));
}
/** sala (índice em def.rooms) que contém o ponto local, ou -1 */
const dgRoomAt = (def, lx, lz) => def.rooms.findIndex(r => lx >= r.b[0] && lx < r.b[2] && lz >= r.b[1] && lz < r.b[3]);
/** portais de entrada/saída (início) e de saída final, em coordenadas absolutas */
function dgPorts(def) { return def.rooms ? { a: { x: def.cx + def.pa[0], z: def.pa[1] }, b: { x: def.cx + def.pb[0], z: def.pb[1] } } : { a: { x: def.cx, z: def.start.z - 5 }, b: { x: def.cx, z: def.exitZ } }; }

/* ---- monstros: escala por nível (calibrada na Cripta: Nv 53 → vida 6100 / ataque 460 / defesa 94) ---- */
const dgS = L => ({ hp: 6100 + (L - 53) * 420, atk: 460 + (L - 53) * 16, def: 94 + (L - 53) * 3.6 });
const dg2m = (base, lv, f, o) => { const B0 = MT[base], L = (lv[0] + lv[1]) / 2, S = dgS(L); f = Object.assign({ h: 1, a: 1, d: 1, x: 1 }, f);
  return Object.assign({}, B0, { model: B0.model || base, dg: true, resp: 0, eq: .02, pot: .02, mats: {}, eva: B0.eva || 0, boss: false, lv, hp: Math.round(S.hp * f.h), atk: Math.round(S.atk * f.a), def: Math.round(S.def * f.d),
    xp: Math.round(xpNeed(L) / 35 * f.x), gold: [Math.round(L * 8 * f.x), Math.round(L * 13.8 * f.x)], aggro: B0.aggro || 9, leash: 32 }, o); };
const dg2b = (base, L, f, o) => { const S = dgS(L); f = Object.assign({ h: 10, a: 1.55, d: 1.6, xd: 7 }, f);
  return Object.assign({}, MT[base], { model: MT[base].model || base, dg: true, resp: 0, eq: .02, pot: .02, mats: {}, eva: 0, boss: true, lv: [L, L], hp: Math.round(S.hp * f.h), atk: Math.round(S.atk * f.a), def: Math.round(S.def * f.d),
    xp: Math.round(xpNeed(L) / f.xd), gold: [Math.round(L * 105), Math.round(L * 160)], aggro: 12, leash: 44 }, o); };
Object.assign(MT, {
  /* Santuário do Sol Poente (Solara, Nv 62–70) */
  dg_sa: dg2m('chacal', [62, 64], { h: 1, a: 1, d: 1.1 }, { n: 'Soldado Solar', tint: '#ffd36a' }),
  dg_sb: dg2m('elemental', [63, 65], { h: .85, a: 1.15, d: .8 }, { n: 'Chama Viva', tint: '#ff8a3a', rng: 5.5, atkInt: 1700 }),
  dg_sc: dg2m('escorpiao', [64, 66], { h: .7, a: .9, d: .9 }, { n: 'Escaravelho Real', tint: '#3ad0c0', spd: 3.9 }),
  dg_sd: dg2m('cobra', [65, 67], { h: 1, a: 1.1, d: .9 }, { n: 'Naja de Ouro', tint: '#ffe27a' }),
  dg_sm1: dg2b('colosso', 66, { h: 10, a: 1.5, d: 1.5, xd: 8 }, { n: 'Guardião Prismático', tint: '#9fe8ff', sc: 1.3, rng: 3.8, atkInt: 1800 }),
  dg_sm2: dg2b('sacerdote', 68, { h: 13, a: 1.55, d: 1.4, xd: 6.5 }, { n: 'Escriba do Sol', tint: '#ffcf5a', sc: 1.5, rng: 5.5, atkInt: 1700 }),
  dg_sboss: dg2b('farao', 70, { h: 24, a: 1.9, d: 1.7, xd: 4.2 }, { n: 'Sumo-Sacerdote Ra-Tehen', tint: '#fff0a0', sc: 1.4, rng: 5.2, atkInt: 1700 }),
  /* Cidadela Congelada (Nevasca, Nv 80–88) */
  dg_na: dg2m('barbaro', [80, 82], { h: 1, a: 1, d: 1.1 }, { n: 'Guarda Gélido', tint: '#9fc4e8' }),
  dg_nb: dg2m('esq_gelo', [81, 83], { h: .9, a: 1.1, d: 1 }, { n: 'Lanceiro Congelado', tint: '#8fd8ff', rng: 2.6 }),
  dg_nc: dg2m('lobo_polar', [82, 84], { h: .8, a: 1, d: .9 }, { n: 'Fera da Geada', tint: '#eef6ff', spd: 4 }),
  dg_nd: dg2m('espectro', [83, 85], { h: .85, a: 1.2, d: .8 }, { n: 'Mago do Inverno', tint: '#8fe0ff', rng: 5.5, atkInt: 1700 }),
  dg_ne: dg2m('yeti_anciao', [84, 86], { h: 1.7, a: 1.15, d: 1.4, x: 1.5 }, { n: 'Gigante Congelado', tint: '#dff2ff' }),
  dg_nm1: dg2b('yeti_rei', 84, { h: 10, a: 1.4, d: 1.5, xd: 8 }, { n: 'Capitão Gélido', tint: '#a0c8ff', sc: 1.5, rng: 4, atkInt: 1700 }),
  dg_nm2: dg2b('espectro', 86, { h: 12, a: 1.5, d: 1.4, xd: 6.5 }, { n: 'Feiticeira da Nevasca', tint: '#e0f6ff', sc: 1.8, rng: 5.5, atkInt: 1700 }),
  dg_nboss: dg2b('golem_gelo', 88, { h: 22, a: 1.8, d: 1.6, xd: 4.2 }, { n: 'Rei do Inverno', tint: '#d0f0ff', sc: 1.9, rng: 4.2, atkInt: 1800 }),
  /* Abismo do Vazio (Nevasca, Nv 92–100) */
  dg_va: dg2m('espectro', [92, 94], { h: 1, a: 1, d: 1 }, { n: 'Sombra do Vazio', tint: '#b07aff' }),
  dg_vb: dg2m('aranha_cristal', [93, 95], { h: .9, a: 1.05, d: .9 }, { n: 'Aberração Rastejante', tint: '#7a3aff', spd: 3.8 }),
  dg_vc: dg2m('sacerdote', [94, 96], { h: .85, a: 1.2, d: .85 }, { n: 'Cultista do Vazio', tint: '#a04dff', rng: 5.5, atkInt: 1700 }),
  dg_vd: dg2m('demonio', [95, 97], { h: 1.6, a: 1.15, d: 1.3, x: 1.4 }, { n: 'Devorador Menor', tint: '#5a2aa8' }),
  dg_vclone: dg2m('espectro', [96, 96], { h: .6, a: .9, d: .8, x: .5 }, { n: 'Reflexo Sombrio', tint: '#6a3ab8', sc: 1.1 }),
  dg_vcrys: dg2m('golem', [94, 94], { h: 2.2, a: 0, d: 1.2, x: 1.2 }, { n: 'Âncora do Vazio', model: 'crystal', tint: '#c070ff', node: true, rng: 0, atkInt: 999999, spd: 0, aggro: 0, h: 3.4 }),
  dg_vm1: dg2b('demonio', 96, { h: 10, a: 1.4, d: 1.5, xd: 8 }, { n: 'Duplo Sombrio', tint: '#6a2aa8', sc: 1.6, rng: 3.2, atkInt: 1600 }),
  dg_vm2: dg2b('dragao', 98, { h: 12, a: 1.5, d: 1.4, xd: 6.5 }, { n: 'Devorador de Estrelas', tint: '#3a2a6a', sc: 1.2, rng: 5, atkInt: 1800 }),
  dg_vboss: dg2b('espectro', 100, { h: 22, a: 1.8, d: 1.6, xd: 4.2 }, { n: 'Arauto do Vazio', tint: '#d09aff', sc: 2.4, rng: 5.2, atkInt: 1700 })
});
MT.dg_vcrys.hp = Math.round(dgS(94).hp * 2.6); MT.dg_vcrys.atk = 0; MT.dg_vcrys.dg = true;
for (const k in MT) MT[k].id = k;

/* ---- origem dos itens (conjuntos): cada monstro novo tem sua marca ---- */
Object.assign(OG, {
  dg_sa: { sf: 'do Soldado Solar', col: '#ffd36a', col2: '#a8741a', el: 'gold', ft: 'crown' },
  dg_sb: { sf: 'da Chama Viva', col: '#ff9a4a', col2: '#a02a1a', el: 'fire', ft: 'crystals' },
  dg_sc: { sf: 'do Escaravelho', col: '#3ad0c0', col2: '#1a6a64', el: 'lightning', ft: 'stinger' },
  dg_sd: { sf: 'da Naja Dourada', col: '#ffe27a', col2: '#a88a2a', el: 'poison', ft: 'hood' },
  dg_sm1: { sf: 'do Prisma', col: '#9fe8ff', col2: '#3a7a9a', el: 'lightning', ft: 'crystals' },
  dg_sm2: { sf: 'do Escriba Solar', col: '#ffcf5a', col2: '#9a6a1a', el: 'gold', ft: 'wraps' },
  dg_sboss: { sf: 'de Ra-Tehen', col: '#fff0a0', col2: '#c9962a', el: 'fire', ft: 'crown' },
  dg_na: { sf: 'do Guarda Gélido', col: '#9fc4e8', col2: '#4a6a8a', el: 'ice', ft: 'tusks' },
  dg_nb: { sf: 'do Lanceiro', col: '#8fd8ff', col2: '#3a7a9a', el: 'ice', ft: 'skull' },
  dg_nc: { sf: 'da Geada', col: '#eef6ff', col2: '#9ab4d0', el: 'ice', ft: 'ears' },
  dg_nd: { sf: 'do Inverno', col: '#8fe0ff', col2: '#3a78b8', el: 'soul', ft: 'horns' },
  dg_ne: { sf: 'do Gigante Gélido', col: '#dff2ff', col2: '#7fb6e0', el: 'ice', ft: 'fur' },
  dg_nm1: { sf: 'do Capitão Gélido', col: '#a0c8ff', col2: '#4a78b8', el: 'ice', ft: 'fur' },
  dg_nm2: { sf: 'da Feiticeira', col: '#e0f6ff', col2: '#6aa8d0', el: 'soul', ft: 'horns' },
  dg_nboss: { sf: 'do Rei do Inverno', col: '#d0f0ff', col2: '#5a8ab8', el: 'ice', ft: 'crown' },
  dg_va: { sf: 'da Sombra', col: '#b07aff', col2: '#4a2a8a', el: 'shadow', ft: 'eyes' },
  dg_vb: { sf: 'da Aberração', col: '#7a3aff', col2: '#3a1a8a', el: 'shadow', ft: 'eyes' },
  dg_vc: { sf: 'do Cultista', col: '#a04dff', col2: '#4a1f7a', el: 'soul', ft: 'crown' },
  dg_vd: { sf: 'do Devorador', col: '#8a4ad8', col2: '#3a1a6a', el: 'shadow', ft: 'horns' },
  dg_vclone: { sf: 'do Reflexo', col: '#6a3ab8', col2: '#2a1a5a', el: 'shadow', ft: 'eyes' },
  dg_vcrys: { sf: 'da Âncora', col: '#c070ff', col2: '#5a2a8a', el: 'soul', ft: 'crystals' },
  dg_vm1: { sf: 'do Duplo Sombrio', col: '#8a4ad8', col2: '#3a1a6a', el: 'shadow', ft: 'horns' },
  dg_vm2: { sf: 'do Devorador de Estrelas', col: '#5a4a9a', col2: '#1f1a3a', el: 'soul', ft: 'spikes' },
  dg_vboss: { sf: 'do Arauto', col: '#d09aff', col2: '#5a2a8a', el: 'shadow', ft: 'crown' }
});

const rm = (x0, z0, x1, z1, open) => ({ b: [x0, z0, x1, z1], open });
const RAIN = (n, per, every, r, mult, c, name) => ({ n, per, every, r, mult, delay: 2000, c, name });
const BIG = (at, r, mult, c, name) => ({ at, r, mult, delay: 2600, c, name });
DUNGEONS.push({
  id: 'solar', name: 'Santuário do Sol Poente', icon: '☀️', reg: 300, minLevel: 62, price: 120000, time: 2700, ilvl: [64, 72], cx: 900, grace: 300, theme: 'sun',
  desc: 'Um templo onde o sol nunca se põe: 8 salas, runas que mudam de ordem a cada visita, um altar para defender e três guardiões com poderes próprios. Itens com SLOTS caem aqui. Tempo limite: 45 min.',
  start: { x: 900, z: -74 }, pa: [0, -78], pb: [0, 174],
  titles: { 1: 'Peregrino do Sol', 10: 'Guardião do Amanhecer', 50: 'Senhor do Zênite', 100: 'Lenda do Sol Poente' },
  cm: ['dg_sm1', 'dg_sm2', 'dg_sboss'], mm: ['dg_sa', 'dg_sb', 'dg_sc', 'dg_sd'],
  rooms: [rm(-12, -80, 12, -56, 0),
    rm(-6, -56, 6, -26, 1), rm(-14, -50, -6, -42, 1), rm(6, -50, 14, -42, 1), rm(-14, -36, -6, -30, 1), rm(6, -36, 14, -30, 1),
    rm(-8, -26, 8, 6, 2), rm(-24, -18, -8, -4, 2), rm(8, -18, 24, -4, 2),
    rm(-18, 6, 18, 40, 3),
    rm(-10, 40, 10, 60, 4), rm(-4, 60, 4, 66, 4),
    rm(-14, 66, 14, 94, 5),
    rm(-4, 94, 4, 100, 6), rm(-16, 100, 16, 128, 6),
    rm(-4, 128, 4, 134, 7), rm(-20, 134, 20, 178, 7)],
  objs: [
    { id: 'ru1', kind: 'rune', at: [-20, -11], name: 'Runa do Alvorecer', sym: '🌅', col: '#ffb36b' },
    { id: 'ru2', kind: 'rune', at: [20, -11], name: 'Runa do Zênite', sym: '☀️', col: '#ffe36b' },
    { id: 'ru3', kind: 'rune', at: [0, 2], name: 'Runa do Poente', sym: '🌇', col: '#ff7a4a' },
    { id: 'ru4', kind: 'rune', at: [0, -22], name: 'Runa da Noite', sym: '🌙', col: '#8fa8ff' },
    { id: 'ste1', kind: 'stele', at: [0, -12], name: 'Estela do Ciclo Solar', sym: '📜' },
    { id: 'altar', kind: 'altar', at: [0, 22], name: 'Altar do Sol Poente', sym: '☀️', col: '#ffd24a' }],
  stages: [
    { k: 'kill', t: 'dg_sa', n: 24, need: 20, room: [-10, -78, 10, -58], text: 'Elimine os Soldados Solares' },
    { k: 'kill', t: 'dg_sb', n: 20, need: 16, room: [-4, -54, 4, -28], text: 'Atravesse a Galeria: elimine as Chamas Vivas', hz: { every: 4200, n: 2, r: 3.4, mult: 1.1, delay: 1800, c: '#ffd24a', name: 'Raios do Sol' } },
    { k: 'runes', objs: ['ru1', 'ru2', 'ru3', 'ru4'], stele: 'ste1', text: 'Acenda as runas na ordem da estela', guards: { t: 'dg_sb', n: 3 }, bad: { r: 5, mult: 1.9, delay: 1000, c: '#ffb347' } },
    { k: 'defend', at: [0, 22], r: 9, secs: 70, text: 'Defenda o Altar do Sol', waves: { every: 10000, t: ['dg_sa', 'dg_sc'], n: [4, 6] } },
    { k: 'statue', id: 'est1', at: [0, 52], t: 'dg_sd', n: 18, need: 14, room: [-8, 42, 8, 58], text: 'Fale com a Estátua da Serpente Dourada', name: 'Estátua da Serpente Dourada',
      ask: '"Forasteiro... a serpente dourada guarda o caminho do sol. Silencie 14 najas de ouro e eu abrirei o portão."', wait: '"Ainda ouço o sibilar das najas..."', fin: '"A serpente aceita seu tributo. O Prisma aguarda."' },
    { k: 'boss', t: 'dg_sm1', at: [0, 82], room: [-12, 70, 12, 92], chest: { slot: 190, tier: 1 }, text: 'Derrote o Guardião Prismático',
      mech: { rain: RAIN(3, 3, 9000, 3.2, 1.2, '#ffd24a', 'Raios Prismáticos'), big: BIG([.5], 8, 2.4, '#ff9a3a', 'Explosão Prismática') } },
    { k: 'boss', t: 'dg_sm2', at: [0, 114], room: [-14, 102, 14, 126], chest: { slot: 191, tier: 2 }, text: 'Derrote o Escriba do Sol',
      mech: { shield: { at: [.65, .3], t: 'dg_sb', n: 4, text: 'O Escriba se cobriu de luz! Destrua as Chamas Vivas para quebrar o escudo!' }, rain: RAIN(3, 3, 10000, 3.2, 1.2, '#ffd24a', 'Chuva de Luz'), enrage: .15 } },
    { k: 'boss', t: 'dg_sboss', at: [0, 156], room: [-18, 136, 18, 176], chest: { slot: 192, tier: 3 }, final: true, text: 'Derrote o Sumo-Sacerdote Ra-Tehen',
      mech: { rain: RAIN(4, 3, 9000, 3.4, 1.3, '#ffd24a', 'Lanças de Sol'), big: BIG([.7, .4], 9, 2.6, '#ff7a2a', 'Eclipse Ardente'), adds: { at: [.8, .5, .25], t: 'dg_sa', n: 4 },
        shield: { at: [.55], t: 'dg_sb', n: 5, text: 'Ra-Tehen invocou um escudo solar! Apague as chamas!' }, nova: { every: 17000, r: 7, mult: 1.9, delay: 1800, c: '#ffd24a', name: 'Nova Solar' }, enrage: .2 } }
  ]
});
DUNGEONS.push({
  id: 'cidadela', name: 'Cidadela Congelada de Valdrak', icon: '🏰', reg: -300, minLevel: 78, price: 350000, time: 3000, ilvl: [80, 88], cx: 1200, grace: 300, theme: 'ice',
  desc: 'Uma fortaleza tomada pelo inverno: muralhas onde o frio mata (só as fogueiras protegem), um cerco de ondas, a Feiticeira da Nevasca e o Rei do Inverno. Itens com SLOTS caem aqui. Tempo limite: 50 min.',
  start: { x: 1200, z: -74 }, pa: [0, -78], pb: [4, 100],
  titles: { 1: 'Invasor da Cidadela', 10: 'Quebra-Gelo', 50: 'Flagelo de Valdrak', 100: 'Lenda da Cidadela Congelada' },
  cm: ['dg_nm1', 'dg_nm2', 'dg_nboss'], mm: ['dg_na', 'dg_nb', 'dg_nc', 'dg_nd', 'dg_ne'],
  rooms: [rm(-12, -80, 12, -60, 0),
    rm(12, -76, 56, -66, 1),
    rm(40, -66, 80, -26, 2), rm(80, -58, 88, -50, 2),
    rm(56, -26, 66, 6, 3),
    rm(24, 6, 80, 44, 4),
    rm(-24, 18, 24, 30, 5),
    rm(-48, 30, -12, 62, 6),
    rm(-20, 62, 28, 104, 7)],
  objs: [],
  stages: [
    { k: 'kill', t: 'dg_na', n: 24, need: 20, room: [-10, -78, 10, -62], text: 'Elimine os Guardas Gélidos' },
    { k: 'kill', t: 'dg_nb', n: 20, need: 16, room: [16, -74, 54, -68], text: 'Atravesse as Muralhas: elimine os Lanceiros', cold: { every: 4000, mult: .5, r: 9 }, fires: [[24, -71], [46, -71]] },
    { k: 'waves', room: [46, -62, 76, -30], text: 'Resista ao Cerco do Pátio', gap: 5000, list: [{ t: 'dg_nc', n: 8 }, { t: 'dg_nb', n: 10 }, { t: 'dg_nd', n: 6 }, { t: 'dg_ne', n: 4 }] },
    { k: 'statue', id: 'est1', at: [61, -10], t: 'dg_nc', n: 18, need: 14, room: [58, -24, 64, 4], text: 'Fale com a Estátua do Rei Antigo', name: 'Estátua do Rei Antigo', cold: { every: 4000, mult: .5, r: 9 }, fires: [[61, -21], [61, 1]],
      ask: '"O inverno governa Valdrak. Mostre que ainda há calor em você: derrube 14 feras da geada e a escadaria se abrirá."', wait: '"As feras da geada ainda uivam..."', fin: '"O calor de vocês me convenceu. Sigam para o Grande Salão."' },
    { k: 'boss', t: 'dg_nm1', at: [52, 26], room: [30, 12, 74, 40], chest: { slot: 190, tier: 1 }, text: 'Derrote o Capitão Gélido',
      mech: { rain: RAIN(3, 3, 9000, 2.8, 1.2, '#bfe6ff', 'Estalactites'), adds: { at: [.6, .3], t: 'dg_nb', n: 4 }, big: BIG([.4], 8, 2.4, '#9fd8ff', 'Golpe Glacial') } },
    { k: 'kill', t: 'dg_nd', n: 20, need: 16, room: [-20, 20, 20, 28], text: 'Limpe a Armaria dos Magos do Inverno', hz: { every: 4000, n: 2, r: 3.2, mult: 1.15, delay: 1700, c: '#bfe6ff', name: 'Estalactites' } },
    { k: 'boss', t: 'dg_nm2', at: [-30, 46], room: [-44, 34, -16, 60], chest: { slot: 191, tier: 2 }, text: 'Derrote a Feiticeira da Nevasca',
      mech: { shield: { at: [.6], t: 'dg_nd', n: 4, text: 'A Feiticeira se envolveu em gelo! Derrote seus magos para quebrar o escudo!' }, blink: { at: [.75, .5, .25] }, rain: RAIN(3, 3, 10000, 3, 1.2, '#bfe6ff', 'Nevasca') } },
    { k: 'boss', t: 'dg_nboss', at: [4, 86], room: [-14, 68, 22, 100], chest: { slot: 192, tier: 3 }, final: true, text: 'Derrote o Rei do Inverno',
      mech: { big: BIG([.66, .33], 9, 2.6, '#7fd0ff', 'Tempestade do Rei'), nova: { every: 16000, r: 7.5, mult: 2, delay: 1800, c: '#bfe6ff', name: 'Nova Gélida' }, adds: { at: [.8, .5], t: 'dg_nc', n: 5 },
        rain: RAIN(4, 3, 10000, 3.2, 1.3, '#bfe6ff', 'Lanças de Gelo'), enrage: .2 } }
  ]
});
DUNGEONS.push({
  id: 'abismo', name: 'Abismo do Vazio Sem Fim', icon: '🌌', reg: -300, minLevel: 90, price: 800000, time: 3300, ilvl: [92, 100], cx: 1500, grace: 300, theme: 'void',
  desc: 'Uma rachadura entre mundos: âncoras de cristal para destruir, runas coloridas que mudam de ordem, uma fenda para fechar e três senhores do Vazio que se teletransportam. Itens com SLOTS caem aqui. Tempo limite: 55 min.',
  start: { x: 1500, z: -74 }, pa: [0, -78], pb: [0, 208],
  titles: { 1: 'Viajante do Vazio', 10: 'Caçador de Sombras', 50: 'Ruína das Estrelas', 100: 'Lenda do Abismo' },
  cm: ['dg_vm1', 'dg_vm2', 'dg_vboss'], mm: ['dg_va', 'dg_vb', 'dg_vc', 'dg_vd'],
  rooms: [rm(-12, -80, 12, -60, 0),
    rm(-4, -60, 4, -36, 1),
    rm(-20, -36, 20, 4, 2),
    rm(-4, 4, 4, 28, 3), rm(-22, 28, 22, 64, 3),
    rm(-4, 64, 4, 70, 4), rm(-16, 70, 16, 100, 4),
    rm(-4, 100, 4, 106, 5), rm(-24, 106, 24, 134, 5),
    rm(-4, 134, 4, 140, 6), rm(-18, 140, 18, 168, 6),
    rm(-4, 168, 4, 174, 7), rm(-22, 174, 22, 212, 7)],
  objs: [
    { id: 'rv1', kind: 'rune', at: [-16, 38], name: 'Runa Rubra', sym: '🔴', col: '#ff4a6a' },
    { id: 'rv2', kind: 'rune', at: [16, 38], name: 'Runa Anil', sym: '🔵', col: '#4a7aff' },
    { id: 'rv3', kind: 'rune', at: [-16, 56], name: 'Runa Jade', sym: '🟢', col: '#3adf8a' },
    { id: 'rv4', kind: 'rune', at: [16, 56], name: 'Runa Violeta', sym: '🟣', col: '#b06aff' },
    { id: 'ste2', kind: 'stele', at: [0, 46], name: 'Monólito das Cores', sym: '📜' },
    { id: 'altar', kind: 'altar', at: [0, 120], name: 'Fenda do Vazio', sym: '🌀', col: '#b06aff' }],
  stages: [
    { k: 'kill', t: 'dg_va', n: 24, need: 20, room: [-10, -78, 10, -62], text: 'Elimine as Sombras do Vazio' },
    { k: 'kill', t: 'dg_vb', n: 18, need: 14, room: [-3, -58, 3, -38], text: 'Cruze a Ponte de Cristal: elimine as Aberrações', hz: { every: 3800, n: 2, r: 3.2, mult: 1.2, delay: 1600, c: '#b06aff', name: 'Fenda do Vazio' } },
    { k: 'crystals', ct: 'dg_vcrys', at: [[-14, -28], [14, -28], [-14, -4], [14, -4]], text: 'Destrua as Âncoras do Vazio', spawn: { every: 9000, t: ['dg_va', 'dg_vd'], n: [2, 3], cap: 12 } },
    { k: 'runes', objs: ['rv1', 'rv2', 'rv3', 'rv4'], stele: 'ste2', text: 'Ative as runas na ordem do monólito', guards: { t: 'dg_vc', n: 3 }, bad: { r: 5, mult: 2, delay: 1000, c: '#b06aff' } },
    { k: 'boss', t: 'dg_vm1', at: [0, 88], room: [-14, 72, 14, 98], chest: { slot: 190, tier: 1 }, text: 'Derrote o Duplo Sombrio',
      mech: { adds: { at: [.8, .55, .3], t: 'dg_vclone', n: 3 }, rain: RAIN(3, 3, 9000, 3.2, 1.25, '#b06aff', 'Lâminas de Sombra'), big: BIG([.45], 8, 2.5, '#8a4ad8', 'Implosão Sombria') } },
    { k: 'defend', at: [0, 120], r: 10, secs: 80, text: 'Feche a Fenda do Vazio', waves: { every: 9000, t: ['dg_vc', 'dg_vb'], n: [4, 6] } },
    { k: 'boss', t: 'dg_vm2', at: [0, 154], room: [-16, 142, 16, 166], chest: { slot: 191, tier: 2 }, text: 'Derrote o Devorador de Estrelas',
      mech: { shield: { at: [.7, .35], t: 'dg_vc', n: 4, text: 'O Devorador absorveu energia do Vazio! Derrote os Cultistas para quebrar o escudo!' }, blink: { at: [.5] }, big: BIG([.6], 9, 2.6, '#5a4a9a', 'Buraco Negro') } },
    { k: 'boss', t: 'dg_vboss', at: [0, 194], room: [-20, 178, 20, 210], chest: { slot: 192, tier: 3 }, final: true, text: 'Derrote o Arauto do Vazio',
      mech: { nova: { every: 15000, r: 8, mult: 2.1, delay: 1800, c: '#d09aff', name: 'Nova do Vazio' }, blink: { at: [.75, .5, .25] }, adds: { at: [.8, .5], t: 'dg_vclone', n: 4 },
        big: BIG([.66, .33], 9, 2.7, '#b06aff', 'Colapso'), rain: RAIN(4, 3, 9000, 3.2, 1.3, '#d09aff', 'Estrelas Cadentes'), enrage: .2 } }
  ]
});

const ZONES=[
 {t:'slime',x:-24,z:-14,r:8,n:10,col:'#3f7a55',name:'Pântano das Gosmas'},
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
 {t:'farao',x:300,z:58,r:5,n:1,col:'#8a6a1a',name:'Pirâmide do Faraó'},
 {t:'espantalho',x:0,z:25,r:7,n:9,grid:4,col:'#8a7440',name:'🌾 Campo de Treino de Vila Aurora'},
 {t:'espantalho',x:300,z:28,r:7,n:9,grid:4,col:'#a08a4a',name:'🌾 Campo de Treino de Solara'},
 // ===== Nevasca (centro em x=-300) =====
 {t:'lobo_polar',x:-272,z:-24,r:9,n:10,col:'#b8c8d8',name:'Tundra dos Lobos Polares'},
 {t:'barbaro',x:-330,z:-22,r:9,n:10,col:'#7a8aa0',name:'Acampamento Bárbaro'},
 {t:'esq_gelo',x:-334,z:22,r:10,n:10,col:'#6a8aa8',name:'Cemitério Congelado'},
 {t:'aranha_cristal',x:-264,z:24,r:10,n:10,col:'#8ab8d8',name:'Caverna de Cristal'},
 {t:'yeti_anciao',x:-302,z:-52,r:10,n:9,col:'#dbe8f5',name:'Cume dos Yetis'},
 {t:'espectro',x:-250,z:-48,r:10,n:9,col:'#5a8ab8',name:'Vale dos Espectros'},
 {t:'golem_gelo',x:-352,z:-50,r:4,n:1,col:'#4a6a88',name:'Geleira do Golem Eterno'},
 {t:'yeti_rei',x:-356,z:38,r:4,n:1,col:'#c8dcee',name:'Trono do Yeti Rei'},
 {t:'dragao_gelo',x:-296,z:60,r:5,n:1,col:'#3a5a7a',name:'Pico do Dragão Glacial'},
 {t:'espantalho',x:-300,z:28,r:7,n:9,grid:4,col:'#a8c0d8',name:'🌾 Campo de Treino de Nevasca'},
 // ===== Arenas dos Chefes de Mundo (o chefe só aparece nos horários marcados) =====
 {t:'wb_a',x:64,z:6,r:11,n:1,wb:1,col:'#5a2a5a',name:'☠️ Arena da Rainha Gosma'},
 {t:'wb_s',x:236,z:4,r:11,n:1,wb:1,col:'#6a4a1a',name:'☠️ Arena do Escorpião-Rei'},
 {t:'wb_n',x:-236,z:2,r:11,n:1,wb:1,col:'#3a5a8a',name:'☠️ Arena do Wendigo'}];

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
 // ===== Nevasca =====
 Q('n1x','astrid','Lobos da Tundra','Lobos polares cercam a vila. Elimine 12.','lobo_polar',12,75,9000,40000,E('weapon',76,3)),
 Q('n2x','astrid','Bárbaros das Neves','Clãs bárbaros atacam as caravanas. Elimine 14.','barbaro',14,79,11000,55000,E('armor',80,3)),
 Q('n3x','astrid','Os Mortos Congelados','O cemitério gelado desperta. Destrua 14 esqueletos.','esq_gelo',14,83,13000,70000,E('helmet',84,3)),
 Q('n4x','astrid','A Caverna de Cristal','Aranhas de cristal tomaram a caverna. Elimine 14.','aranha_cristal',14,87,15000,90000,{...E('boots',88,3),sp:1}),
 Q('n5x','astrid','O Golem de Gelo Eterno','Uma criatura de gelo milenar desperta na geleira. Derrote-a!','golem_gelo',1,88,30000,160000,{...E('weapon',89,3),sp:2}),
 Q('n6x','astrid','Cume dos Yetis','Yetis anciões descem das montanhas. Elimine 15.','yeti_anciao',15,91,19000,120000,E('ring',92,3)),
 Q('n7x','astrid','Vale dos Espectros','Espíritos do gelo vagam pelo vale. Elimine 15.','espectro',15,95,23000,150000,{...E('armor',96,3),sp:1}),
 Q('n8x','astrid','O Dragão Glacial','A lenda do pico acorda. Derrote o Dragão Glacial!','dragao_gelo',1,99,60000,320000,{...E('weapon',100,3),sp:3}),
 Q('b1x','bjorn','Peles Polares','Preciso de peles frescas. Elimine 25 lobos polares.','lobo_polar',25,76,12000,50000,{pot:{hp:10}}),
 Q('b2x','bjorn','A Alcateia','A alcateia não para de crescer. Elimine 35.','lobo_polar',35,77,16000,80000,E('boots',78,3)),
 Q('k1x','skadi','Rituais Profanados','Os bárbaros profanam o gelo sagrado. Elimine 25.','barbaro',25,79,14000,70000,E('ring',80,3)),
 Q('k2x','skadi','Sangue no Gelo','Mais bárbaros chegam. Elimine 35.','barbaro',35,81,20000,110000,{sp:1}),
 Q('h1x','hilda','Descanso Eterno','Dê paz aos mortos. Elimine 25 esqueletos congelados.','esq_gelo',25,83,17000,100000,E('helmet',85,3)),
 Q('h2x','hilda','Cova Rasa','Eles voltam sempre. Elimine 35.','esq_gelo',35,85,24000,140000,{sp:1}),
 Q('i1x','ingrid','Fios de Cristal','Preciso de fios para o tear. Elimine 25 aranhas.','aranha_cristal',25,87,20000,130000,E('boots',88,3)),
 Q('i2x','ingrid','Ninho de Cristal','Destrua o ninho: elimine 35 aranhas.','aranha_cristal',35,89,28000,170000,E('armor',90,3)),
 Q('l1x','leif','Pegadas Gigantes','Os yetis anciões estão enormes. Elimine 20.','yeti_anciao',20,91,24000,150000,E('weapon',92,3)),
 Q('l2x','leif','Coração de Gelo','Colete corações de gelo: elimine 30 yetis.','yeti_anciao',30,93,32000,200000,{sp:1}),
 Q('v1x','solveig','Sussurros do Vale','Os espectros sussurram meu nome. Elimine 25.','espectro',25,95,30000,190000,E('ring',96,3)),
 Q('v2x','solveig','Almas Inquietas','Liberte as almas: elimine 35 espectros.','espectro',35,97,40000,260000,{sp:1}),
 Q('o1x','odin','O Rei das Neves','O Yeti Rei domina o trono de gelo. Derrote-o!','yeti_rei',1,95,50000,300000,{...E('helmet',96,3),sp:2}),
 Q('z1','zafira','Presas Venenosas','Preciso de veneno fresco. Elimine 20 najas.','cobra',20,58,7500,15000,E('boots',60,3)),
 Q('z2','zafira','Ninho das Najas','Destrua o ninho: elimine 30 najas.','cobra',30,60,10500,22000,E('weapon',61,3)),
 Q('i1','ibrahim','Redemoinhos Vivos','As tempestades têm vida! Elimine 20 elementais.','elemental',20,62,9000,20000,E('armor',63,3)),
 Q('i2','ibrahim','Olho da Tempestade','Acalme o deserto: elimine 30 elementais.','elemental',30,64,12500,28000,{sp:1}),
 Q('a1s','anuket','Guardiões Caídos','Liberte as almas dos chacais. Elimine 20.','chacal',20,66,10500,26000,E('ring',68,3)),
 Q('a2s','anuket','Fim da Vigília','Purifique o templo: elimine 20 sacerdotes.','sacerdote',20,70,13000,36000,E('helmet',71,3)),
 Q('h1','hamid','Relíquias Perdidas','Os sacerdotes guardam relíquias. Elimine 25.','sacerdote',25,71,14500,42000,E('boots',72,3)),
 Q('h2','hamid','A Maldição Eterna','Quebre a maldição: derrote o Faraó Imortal outra vez.','farao',1,74,20000,60000,{...E('weapon',76,3),sp:2})];
const QNAME={slime:'gosmas',lobo:'lobos',goblin:'goblins',esqueleto:'esqueletos',golem:'Golem Ancião',aranha:'aranhas',orc:'orcs',yeti:'yetis',demonio:'demônios',dragao:'Dragão Rubro',escorpiao:'escorpiões',mumia:'múmias',cobra:'najas',elemental:'elementais',chacal:'chacais',sacerdote:'sacerdotes',colosso:'Colosso de Obsidiana',farao:'Faraó Imortal',lobo_polar:'lobos polares',barbaro:'bárbaros',esq_gelo:'esqueletos congelados',aranha_cristal:'aranhas de cristal',yeti_anciao:'yetis anciões',espectro:'espectros glaciais',golem_gelo:'Golem de Gelo Eterno',yeti_rei:'Yeti Rei',dragao_gelo:'Dragão Glacial'};

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
 {id:'g_arma1',at:'ferreiro_gelo',n:'Arma Polar (Nv 78)',icon:'⚒️',d:'Arma da sua classe • Épico',ing:{pelepolar:10,runabar:6,essencia:30},gold:120000,out:(cls)=>genItem('weapon',78,3,cls,cls,0,'lobo_polar')},
 {id:'g_arm',at:'ferreiro_gelo',n:'Armadura Bárbara de Gelo (Nv 82)',icon:'🥋',d:'Épico',ing:{runabar:12,pelepolar:8,essencia:30},gold:150000,out:(cls)=>genItem('armor',82,3,undefined,undefined,0,'barbaro')},
 {id:'g_elmo',at:'ferreiro_gelo',n:'Elmo Congelado (Nv 86)',icon:'🪖',d:'Épico',ing:{ossogelo:12,runabar:6,essencia:35},gold:180000,out:(cls)=>genItem('helmet',86,3,undefined,undefined,0,'esq_gelo')},
 {id:'g_botas',at:'ferreiro_gelo',n:'Botas de Cristal (Nv 90)',icon:'👢',d:'Épico',ing:{fiocristal:12,ossogelo:8,essencia:35},gold:210000,out:(cls)=>genItem('boots',90,3,undefined,undefined,0,'aranha_cristal')},
 {id:'g_anel',at:'ferreiro_gelo',n:'Anel do Yeti Ancião (Nv 94)',icon:'💍',d:'Épico',ing:{coracaogelo:8,fiocristal:6,essencia:40},gold:260000,out:(cls)=>genItem('ring',94,3,undefined,undefined,0,'yeti_anciao')},
 {id:'g_gelo',at:'ferreiro_gelo',n:'Arma Glacial (Nv 98)',icon:'❄️',d:'Arma da sua classe • Épico',ing:{essenciagelo:10,coracaogelo:8,nucleogelo:2,essencia:50},gold:340000,out:(cls)=>genItem('weapon',98,3,cls,cls,0,'espectro')},
 {id:'g_dragao',at:'ferreiro_gelo',n:'Arma do Dragão Glacial (Nv 102)',icon:'🐲',d:'Arma da sua classe • Épico',ing:{escamagelo:3,nucleogelo:4,cristalpuro:4,essencia:60},gold:600000,out:(cls)=>genItem('weapon',102,3,cls,cls,0,'dragao_gelo')},
 {id:'s_farao',at:'ferreira',n:'Arma Faraônica (Nv 74)',icon:'👑',d:'Arma da sua classe • Épico',ing:{selo:3,obsidiana:4,ankh:10,essencia:30},gold:80000,out:(cls)=>genItem('weapon',74,3,cls,cls,0,'farao')}];
const SHOPT=['missoes','comprar','vender'];
const NPCS=[
 {id:'ferreiro',name:'Dorn, o Ferreiro',icon:'🔨',x:-6,z:-3,col:'#8a5a3a',tabs:['forja','aprimorar','quebrar'],greet:'Traga materiais e ouro e eu forjo o que precisar. Também posso aprimorar seu equipamento — mas há risco!'},
 {id:'mercador',name:'Mira, a Mercadora',icon:'💰',x:6,z:-3,col:'#c79a3b',tabs:['comprar','vender'],greet:'Poções, caixas misteriosas e compro o que você não precisar!'},
 {id:'capitao',name:'Capitão Aldric',icon:'🛡️',x:0,z:-7,col:'#3f6fb5',tabs:['missoes'],greet:'A vila precisa de heróis. Cumpra as missões principais e será recompensado.'},
 {id:'mestre',name:'Mestre Kaelen',icon:'📖',x:-4.5,z:4,col:'#6b46b5',tabs:[],greet:'',hat:'#4b2f85'},
 {id:'leilao',name:'Valter, o Leiloeiro',icon:'⚖️',x:9.4,z:1.8,col:'#a8782e',tabs:['leilao'],greet:'Bem-vindo à Casa de Leilão! Aqui você anuncia seus itens e compra o que outros aventureiros estão vendendo.',hat:'#5a3a1a'},
 {id:'evento',name:'Noel, Guardião dos Presentes',icon:'🎁',x:0,z:7.5,col:'#c0392b',tabs:['evento'],greet:'Ho ho ho! Evento de Boas-vindas, Inauguração e Natal: suba de nível e venha buscar seus pacotes de presentes!',hat:'#d4a62a'},
 {id:'bau',name:'Baú do Aventureiro',icon:'📦',x:4.5,z:4,col:'#8a6a43',tabs:['bau'],greet:'Seus itens guardados aqui são compartilhados com todos os seus personagens.'},
 {id:'elda',name:'Vovó Elda',icon:'🌿',x:-19.5,z:4.5,col:'#5a8a4a',tabs:SHOPT,greet:'As gosmas estragam minha horta... e eu tenho poções para vender, querido.',hat:'#7a5a3a',camp:true},
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
 {id:'ferreira',name:'Sahra, a Ferreira Solar',icon:'🔨',x:293,z:-2,col:'#a86a3a',tabs:['forja','aprimorar','quebrar'],greet:'Materiais do deserto forjam o melhor aço que você já viu. Também aprimoro equipamentos — mas há risco!',hat:'#6a3a1a',smith:true},
 {id:'mercador2',name:'Hakim, o Mercador',icon:'💰',x:307,z:-2,col:'#2f7a8a',tabs:['comprar','vender'],greet:'Poções superiores e caixas raras, direto das caravanas! Tudo mais caro, mas vale cada moeda.',hat:'#d8c9a0',shop:'solara'},
 {id:'khalid',name:'Comandante Khalid',icon:'🛡️',x:295,z:-6,col:'#a8832a',tabs:['missoes'],greet:'Solara resiste graças a heróis como você. Cumpra as missões principais do deserto.',hat:'#c9a227'},
 {id:'nadir',name:'Caçador Nadir',icon:'🦂',x:321,z:-9,col:'#8a6a3a',tabs:SHOPT,greet:'Os escorpiões ficaram enormes. Cuidado com o ferrão!',hat:'#d8c9a0',camp:true,shop:'solara'},
 {id:'neferu',name:'Escriba Neferu',icon:'📜',x:281,z:-14,col:'#6a5a8a',tabs:SHOPT,greet:'As tumbas guardam segredos... e maldições.',hat:'#3a2a5a',camp:true,shop:'solara'},
 {id:'zafira',name:'Encantadora Zafira',icon:'🐍',x:267,z:14,col:'#3f8a4a',tabs:SHOPT,greet:'As najas obedecem a quem sabe ouvir. Mas estas enlouqueceram.',hat:'#2f6a3a',camp:true,shop:'solara'},
 {id:'ibrahim',name:'Beduíno Ibrahim',icon:'🌪️',x:329,z:20,col:'#c9a45a',tabs:SHOPT,greet:'O vento tem fome. Eu vi uma tempestade andar!',hat:'#e8dcb0',camp:true,shop:'solara'},
 {id:'anuket',name:'Sacerdotisa Anuket',icon:'☥',x:322,z:-42,col:'#4a3a8a',tabs:SHOPT,greet:'Os guardiões de Anúbis já não descansam.',hat:'#d4a62a',camp:true,shop:'solara'},
 {id:'guarda_cripta',name:'Guardião das Criptas',icon:'🗝️',x:309,z:6,col:'#5a4a7a',tabs:['dungeon'],greet:'Há criptas esquecidas nos cantos mais distantes do deserto. Compre o ingresso comigo e fale com o portal da cripta. Quem tem ingresso e está no seu grupo entra junto!',hat:'#d4a62a'},
 {id:'dg_cripta',name:'🏺 Cripta das Areias (Nv 50+)',icon:'🏺',x:366,z:66,col:'#d4a62a',tabs:[],greet:'',dungeon:'cripta'},
 {id:'dg_solar',name:'☀️ Santuário do Sol Poente (Nv 62+)',icon:'☀️',x:366,z:-70,col:'#ffd24a',tabs:[],greet:'',dungeon:'solar'},
 // ===== Nevasca (neve) =====
 {id:'portal_c',name:'🌀 Portal da Nevasca (Nv 75+)',icon:'🌀',x:-32,z:-45,col:'#8fd8ff',tabs:[],greet:'',portal:{name:'Vila da Nevasca',lvl:75,to:{x:-300,z:-7}}},
 {id:'portal_d',name:'🌀 Portal para a Vila Aurora',icon:'🌀',x:-300,z:-11,col:'#ffcf6b',tabs:[],greet:'',portal:{name:'Vila Aurora',lvl:0,to:{x:-32,z:-41}}},
 {id:'guarda_gelo',name:'Vigia das Cidadelas',icon:'🗝️',x:-309,z:6,col:'#5a7aa0',tabs:['dungeon'],greet:'Dois lugares malditos esperam por heróis na Nevasca: a Cidadela Congelada, a noroeste, e o Abismo do Vazio, a sudeste. Compre o ingresso comigo e fale com o portal. Quem tem ingresso e está no seu grupo entra junto!',hat:'#cfe8ff'},
 {id:'dg_cidadela',name:'🏰 Cidadela Congelada (Nv 78+)',icon:'🏰',x:-368,z:-70,col:'#8fd8ff',tabs:[],greet:'',dungeon:'cidadela'},
 {id:'dg_abismo',name:'🌌 Abismo do Vazio (Nv 90+)',icon:'🌌',x:-232,z:68,col:'#a070ff',tabs:[],greet:'',dungeon:'abismo'},
 {id:'bau3',name:'Baú do Aventureiro',icon:'📦',x:-295.5,z:4,col:'#8a6a43',tabs:['bau'],greet:'O mesmo baú da Vila Aurora: seus itens guardados aqui são compartilhados com todos os seus personagens.',chest:true},
 {id:'ferreiro_gelo',name:'Ragnar, o Ferreiro do Gelo',icon:'🔨',x:-307,z:-2,col:'#6a8aa8',tabs:['forja','aprimorar','quebrar'],greet:'O aço temperado na neve nunca quebra. Também aprimoro equipamentos — mas há risco!',hat:'#3a5a78',smith:true},
 {id:'mercador3',name:'Frida, a Mercadora Polar',icon:'💰',x:-293,z:-2,col:'#5a9ab8',tabs:['comprar','vender'],greet:'Poções, caixas e capas para o frio! Tudo caro, mas vale cada moeda.',hat:'#e8f2ff',shop:'gelo'},
 {id:'astrid',name:'Capitã Astrid',icon:'🛡️',x:-305,z:-6,col:'#4a78a8',tabs:['missoes'],greet:'A Vila da Nevasca resiste graças a heróis como você. Cumpra as missões principais da tundra.',hat:'#c8dcee'},
 {id:'bjorn',name:'Caçador Bjorn',icon:'🐺',x:-288,z:-14,col:'#8a9aa8',tabs:SHOPT,greet:'Os lobos polares ficaram enormes. Não corra, eles são mais rápidos.',hat:'#e8f2ff',camp:true,shop:'gelo'},
 {id:'skadi',name:'Xamã Skadi',icon:'🪓',x:-320,z:-12,col:'#7a5a8a',tabs:SHOPT,greet:'Os bárbaros esqueceram os velhos pactos com o gelo.',hat:'#4a3a6a',camp:true,shop:'gelo'},
 {id:'hilda',name:'Coveira Hilda',icon:'⚰️',x:-322,z:14,col:'#6a7a98',tabs:SHOPT,greet:'Nem a morte descansa neste frio...',hat:'#3a4a68',camp:true,shop:'gelo'},
 {id:'ingrid',name:'Tecelã Ingrid',icon:'🕸️',x:-280,z:12,col:'#8ab8d0',tabs:SHOPT,greet:'Os fios de cristal valem mais que ouro, se você sobreviver para colhê-los.',hat:'#c8e8f8',camp:true,shop:'gelo'},
 {id:'leif',name:'Explorador Leif',icon:'🧭',x:-300,z:-34,col:'#a8b8c8',tabs:SHOPT,greet:'Vi pegadas do tamanho de uma carroça. Cuidado nos cumes!',hat:'#6a7a8a',camp:true,shop:'gelo'},
 {id:'solveig',name:'Vidente Solveig',icon:'🔮',x:-262,z:-34,col:'#5a8ad0',tabs:SHOPT,greet:'Os espectros me contaram seu nome antes de você chegar.',hat:'#2a4a8a',camp:true,shop:'gelo'},
 {id:'odin',name:'Sábio Odin',icon:'📖',x:-300,z:44,col:'#9a8ab8',tabs:SHOPT,greet:'O trono de gelo e o pico do dragão guardam o destino deste mundo.',hat:'#4a3a78',camp:true,shop:'gelo'},
 {id:'hamid',name:'Arqueólogo Hamid',icon:'🔭',x:300,z:44,col:'#8a6a4a',tabs:SHOPT,greet:'A grande pirâmide esconde o maior tesouro do mundo... e o maior perigo.',hat:'#a8833a',camp:true,shop:'solara'},
 // ===== Gemólogos: vendem pergaminhos de opção + extensor de slot e engastam as gemas nos equipamentos =====
 {id:'gemas_a',name:'Lapidária Gemma',icon:'💎',x:-9.4,z:1.6,col:'#7a4fb0',tabs:['comprar','engastar'],greet:'Pergaminhos de opção, extensores de slot e engaste de gemas! Cada gema dá um bônus fixo ao seu equipamento.',hat:'#4b2f85',shop:'scr',gem:true},
 {id:'gemas_s',name:'Joalheiro Rashid',icon:'💎',x:295.5,z:4,col:'#2f8a9a',tabs:['comprar','engastar'],greet:'As gemas do deserto guardam o poder do sol. Compre pergaminhos, amplie seus engastes e encaixe as gemas aqui.',hat:'#d8c9a0',shop:'scr',gem:true},
 {id:'gemas_n',name:'Gemóloga Freya',icon:'💎',x:-304.5,z:4,col:'#5a78d0',tabs:['comprar','engastar'],greet:'Gemas forjadas no gelo eterno. Posso vender pergaminhos, ampliar engastes e encaixar gemas no seu equipamento.',hat:'#c8e8f8',shop:'scr',gem:true},
 // ===== Guildas (fundação e administração) e Caminhos de Especialização (nível 100) =====
 {id:'guilda_a',name:'Escrivã Mirela, da Guilda',icon:'🏰',x:-7,z:-6.5,col:'#9a3a3a',tabs:['guilda'],greet:'Fundar uma guilda custa 10.000.000 de ouro. Com ela vêm chat próprio, baú compartilhado e um prêmio semanal coletivo.',hat:'#6a1f1f',banner:'#c23a3a'},
 {id:'guilda_s',name:'Escriba Tamin, da Guilda',icon:'🏰',x:302,z:-9,col:'#a8832a',tabs:['guilda'],greet:'Reúna seus companheiros sob uma só bandeira. Fundar uma guilda custa 10.000.000 de ouro.',hat:'#c9a227',banner:'#d4a62a'},
 {id:'guilda_n',name:'Escrivão Torvald, da Guilda',icon:'🏰',x:-298,z:-9,col:'#3a6aa0',tabs:['guilda'],greet:'No frio, só quem anda em grupo sobrevive. Fundar uma guilda custa 10.000.000 de ouro.',hat:'#c8dcee',banner:'#4a8ad0'},
 {id:'caminhos_a',name:'Mestre Eldrin dos Caminhos',icon:'🧙',x:7.5,z:-6.5,col:'#6b46b5',tabs:['caminhos'],greet:'No nível 100 o herói enfim escolhe quem será. Mas antes é preciso provar que merece.',hat:'#4b2f85',spec:true},
 {id:'caminhos_s',name:'Sábia Nefertari dos Caminhos',icon:'🧙',x:310,z:-5,col:'#8a5aa8',tabs:['caminhos'],greet:'Os caminhos do poder se abrem para quem alcança o nível 100 e passa pela Provação.',hat:'#d4a62a',spec:true},
 {id:'caminhos_n',name:'Ancião Rurik dos Caminhos',icon:'🧙',x:-290,z:-6,col:'#5a78d0',tabs:['caminhos'],greet:'Chegar ao nível 100 é só o começo. Prove seu valor e escolha o seu caminho.',hat:'#dfeaf5',spec:true},
 // ===== Arena PK (zona separada e opcional): um Mestre em cada cidade e o Guardião dentro da arena =====
 {id:'arena_a',name:'Mestre Brutus, da Arena',icon:'🏟️',x:10.2,z:-3,col:'#b0452a',tabs:['arena'],greet:'A Arena PK é separada da cidade: lá vale tudo, todos contra todos. Entre só se estiver pronto — e dá para sair quando quiser.',hat:'#6a2418',banner:'#d4552a',arena:true},
 {id:'arena_s',name:'Mestra Kalila, da Arena',icon:'🏟️',x:311,z:1.5,col:'#c0792a',tabs:['arena'],greet:'Na areia da arena os fracos caem e os fortes viram lenda. Quer provar o seu valor?',hat:'#7a4a14',banner:'#e08a2a',arena:true},
 {id:'arena_n',name:'Mestre Bjarn, da Arena',icon:'🏟️',x:-289.5,z:2.5,col:'#5a78d0',tabs:['arena'],greet:'Aqui no frio a gente resolve as diferenças na arena. Sem rancor: quem cai, volta.',hat:'#2a3e6a',banner:'#5a8ad0',arena:true},
 {id:'arena_g',name:'Guardião da Arena',icon:'🏟️',x:1800,z:-31,col:'#a03a2a',tabs:['arena'],greet:'Quem cai precisa voltar à cidade para renascer, sem perder nada. Para sair, fale comigo (só fora de combate).',hat:'#5a1c14',banner:'#d4552a',arena:true}];
// Cidades mais espaçadas: os NPCs que ficavam dentro das zonas seguras antigas (raio 11 / 13) são afastados do centro na mesma proporção
// em que a zona segura cresceu (Aurora 11→15; Solara e Nevasca 13→17,5). NPCs de fora (missões, portais de calabouço) não mudam.
{ const OLD = [{ x: 0, r: 11, k: 15 / 11 }, { x: 300, r: 13, k: 17.5 / 13 }, { x: -300, r: 13, k: 17.5 / 13 }];
  for (const n of NPCS) { if (n.id === 'arena_g') continue; const t = OLD.find(q => Math.hypot(n.x - q.x, n.z) < q.r + .5); if (!t) continue;
    n.x = Math.round((t.x + (n.x - t.x) * t.k) * 10) / 10; n.z = Math.round(n.z * t.k * 10) / 10; } }


/* ====================== FUNÇÕES DE REGRA ====================== */
const MON_TOWN_R = 15;
R.TOWN_R = MON_TOWN_R;
R.TOWNS = [{ x: 0, z: 0, r: 15 }, { x: 300, z: 0, r: 17.5 }, { x: -300, z: 0, r: 17.5 }];   // zonas seguras (Vila Aurora, Solara e Nevasca)   // zonas seguras (Vila Aurora e Solara)
R.inTown = (x, z) => R.TOWNS.some(t => Math.hypot(x - t.x, z - t.z) < t.r);
const eff = (it, k) => (it[k] || 0) * (1 + .12 * (it.plus || 0));
const nm = it => it.k === 'tix' ? 'Ingresso: ' + ((DUNGEONS.find(d => d.id === it.id) || {}).name || 'Calabouço') : it.k === 'eq' ? it.name + (it.plus ? ' +' + it.plus : '') + (it.sl ? ' ' + Array.from({ length: it.sl }, (_, i) => it.gm && it.gm[i] ? '◆' : '◇').join('') : '') : it.k === 'mat' ? MATS[it.id].n : it.k === 'pot' ? POTS[it.id].n : (it.n + ' ouro');
const sellPrice = it => it.bd ? 0 : it.k === 'eq' && it.slot === 'cape' ? it.ilvl * 40 : it.k === 'eq' ? Math.round((it.ilvl * 5 + 5) * (1 + it.rar * 1.1) * (1 + it.plus * .6) * (1 + (it.sl || 0) * .5) * .5 * (it.wb ? 4 : 1)) : (it.k === 'mat' ? MATS[it.id].v : POTS[it.id].v);
const MAXPLUS = 10;
/** chave de "modelo" do item para o histórico de preços do leilão: itens iguais (nome, nível, raridade, refino, engastes) compartilham o histórico */
const hkeyOf = it => it.k === 'eq' ? ['eq', it.slot, it.name, it.rar, it.ilvl, it.plus || 0, it.sl || 0].join('|') : it.k + ':' + it.id;
const upRate = p => [1, 1, 1, .85, .7, .55, .4, .3, .2, .12][p] || 0;
const upCost = it => { const p = it.plus || 0; return { ferro: p + 1, essencia: p >= 4 ? Math.floor(p / 2) : 0, gold: Math.round(40 * Math.pow(p + 1, 1.7)) }; };
const slotPool = cls => cls === 'cavaleiro' ? ['weapon', 'armor', 'helmet', 'boots', 'ring', 'bracelet', 'earring', 'weapon', 'shield', 'shield'] : ['weapon', 'armor', 'helmet', 'boots', 'ring', 'bracelet', 'earring', 'weapon'];
/** Origem sorteada para itens sem monstro (caixas, missões): um monstro com nível próximo do item. */
const originFor = ilvl => { const c = Object.keys(MT).filter(k => OG[k] && !k.startsWith('dg_') && !MT[k].wb && MT[k].lv[0] <= ilvl + 4 && MT[k].lv[1] >= ilvl - 8); return c.length ? pick(c) : undefined; };

/** Capas: sem raridade, atributos fixos. 'm' = estola azul (magos), 'p' = capa vermelha (físicos). */
/** Estilo da capa de cada classe: p = capa vermelha (físico), m = estola azul (mágico), a = manto encapuzado (assassino). */
const capeKind = cls => cls === 'assassino' ? 'a' : (cls === 'mago' || cls === 'arqueiro' || cls === 'pierrot') ? 'm' : 'p';
const isMag = cls => capeKind(cls) === 'm';
const CAPEWHO = { p: 'Tanque, Guerreiro e Cavaleiro Pesado', m: 'Arqueiro, Mago e Pierrot', a: 'Assassino' };
function capeStats(it) {
  const m = it.cs === 'm', a = it.cs === 'a', L = it.ilvl;
  it.rar = 0; it.plus = 0; it.atk = 0; it.def = Math.round(1 + L * (m ? .25 : a ? .35 : .5)); it.hp = Math.round(L * (m ? 3 : a ? 3.5 : 4));
  it.bon = a ? { agi: Math.max(1, Math.round(L / 5)), str: Math.max(1, Math.round(L / 9)), vit: Math.max(1, Math.round(L / 10)) } : m ? { int: Math.max(1, Math.round(L / 5)), agi: Math.max(1, Math.round(L / 10)), vit: Math.max(1, Math.round(L / 10)) } : { str: Math.max(1, Math.round(L / 6)), agi: Math.max(1, Math.round(L / 8)), vit: Math.max(1, Math.round(L / 10)) };
  it.icon = m ? '🧣' : a ? '🥷' : '🧥'; delete it.sl; delete it.gm; delete it.mo; return it;
}
function genCape(ilvl, cls, name) {
  ilvl = Math.max(1, Math.min(MAX_LEVEL, Math.floor(ilvl))); const tier = ilvl >= 68 ? 9 : ilvl >= 56 ? 8 : ilvl >= 44 ? 7 : Math.min(6, Math.floor(ilvl / 4)), kind = capeKind(cls), m = kind === 'm';
  const it = { k: 'eq', slot: 'cape', ilvl, rar: 0, req: Math.max(1, ilvl - 1), plus: 0, cs: kind, hp: 0, atk: 0, def: 0, bon: {} };
  it.name = kind === 'a' ? (tier > 6 ? XCA[tier - 7] : CAN[tier]) : tier > 6 ? (m ? XCM : XCP)[tier - 7] : (m ? CMN : CPN)[tier]; if (name) it.name = name; return capeStats(it);
}
function rarRoll(b) { b = b || 0; const r = Math.random(), k = 1 + b; if (r < .02 * k) return 3; if (r < .12 * k) return 2; if (r < .4 + .05 * b) return 1; return 0; }
/** Gera um equipamento. `cls` fixa a classe da arma; sem ela, 70% de chance de ser da classe do dono (`owner`). */
function genItem(slot, ilvl, rar, cls, owner, sl, mo) {
  if (mo === true) mo = originFor(ilvl);
  const tier = ilvl >= 120 ? 11 : ilvl >= 90 ? 10 : ilvl >= 68 ? 9 : ilvl >= 56 ? 8 : ilvl >= 44 ? 7 : Math.min(6, Math.floor(ilvl / 4)), mult = RAR[rar].m, j = () => rnd(.92, 1.08);
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

/* ====================== GEMAS / PERGAMINHOS DE OPÇÃO (engastes ◇) ======================
   Cada pergaminho é uma gema que ocupa UM engaste (◇) de um equipamento e dá um bônus fixo (como as "opções" do Cabal).
   Categoria: 'w' = só em ARMAS • 'a' = armaduras, elmo, botas, escudo e acessórios. O grau define o preço do pergaminho.
   Regras: a mesma opção pode repetir em vários engastes do item; engaste ocupado pode ser trocado (a gema antiga é destruída); capas não têm engastes. */
const GRADES = [
  { id: 'low',  n: 'Baixo',     en: 'Low',     p: 2e6,  c: '#8fd07a' },
  { id: 'med',  n: 'Médio',     en: 'Medium',  p: 5e6,  c: '#5fb4ff' },
  { id: 'high', n: 'Alto',      en: 'High',    p: 1e7,  c: '#c58bff' },
  { id: 'hst',  n: 'Altíssimo', en: 'Highest', p: 2e7,  c: '#ffb347' },
  { id: 'ext',  n: 'Extremo',   en: 'Extreme', p: 4e7,  c: '#ff5a5a' }];
const EXT_PRICE = 6e7, MAX_SLOTS = 3;
/** v = valor por gema • u = unidade • sc:1 = o valor é multiplicado pelo nível (ilvl) do equipamento • k = atributo afetado */
const GEMS = [
  // ---------- ARMA ----------
  { id: 'w_ampe', cat: 'w', g: 4, n: 'Gema da Lâmina Eterna',      o: 'Técnica de Amp. Espada',          k: 'ampE', v: 8,   u: '%',  d: 'Aumenta o dano das HABILIDADES (não do ataque básico) das classes físicas: Guerreiro, Cavaleiro Pesado, Tanque, Assassino e Arqueiro.' },
  { id: 'w_ampm', cat: 'w', g: 4, n: 'Gema do Arcano Eterno',      o: 'Técnica de Amp. Mágica',          k: 'ampM', v: 8,   u: '%',  d: 'Aumenta o dano das HABILIDADES (não do ataque básico) das classes mágicas: Mago e Pierrot.' },
  { id: 'w_crit', cat: 'w', g: 4, n: 'Gema do Olho de Águia',      o: 'Taxa Crítica',                    k: 'crit', v: 4,   u: '%',  d: 'Aumenta a chance de acerto crítico.' },
  { id: 'w_cdmg', cat: 'w', g: 3, n: 'Gema da Fúria Rubra',        o: 'Dano Crítico',                    k: 'cdmg', v: 15,  u: '%',  d: 'Aumenta o dano dos acertos críticos.' },
  { id: 'w_atk',  cat: 'w', g: 1, n: 'Gema da Presa Afiada',       o: 'Ataque',                          k: 'atkE', v: .38, sc: 1,  d: 'Soma ataque ao seu dano base (classes físicas: Guerreiro, Cavaleiro Pesado, Tanque, Assassino e Arqueiro). Cresce com o nível do equipamento.' },
  { id: 'w_matk', cat: 'w', g: 1, n: 'Gema da Chama Mística',      o: 'Ataque Mágico',                   k: 'atkM', v: .38, sc: 1,  d: 'Soma ataque mágico ao seu dano base (classes mágicas: Mago e Pierrot). Cresce com o nível do equipamento.' },
  { id: 'w_acc',  cat: 'w', g: 2, n: 'Gema da Pontaria Certeira',  o: 'Perfuração',                    k: 'pen',  v: 5,   u: '%',  d: 'Seus golpes ignoram parte da defesa do alvo (reduzida pelo "Ignorar Perfuração" do adversário).' },
  { id: 'w_add',  cat: 'w', g: 2, n: 'Gema do Golpe Sombrio',      o: 'Dano Adicional',                  k: 'add',  v: .17, sc: 1,  d: 'Soma dano fixo a CADA golpe, depois da defesa do alvo. Cresce com o nível do equipamento.' },
  { id: 'w_cmax', cat: 'w', g: 3, n: 'Gema do Limite Supremo',     o: 'Aumento de Taxa Crítica Máxima',  k: 'cmax', v: 4,   u: '%',  d: 'Aumenta o limite máximo da chance de crítico (normalmente 52%, no máximo 95%).' },
  // ---------- ARMADURA (armadura, elmo, botas, escudo, anéis, braceletes e brincos) ----------
  { id: 'a_ampe', cat: 'a', g: 4, n: 'Gema do Guardião Eterno',    o: 'Técnica de Amp. Espada',          k: 'ampE', v: 8,   u: '%',  d: 'Aumenta o dano das HABILIDADES das classes físicas: Guerreiro, Cavaleiro Pesado, Tanque, Assassino e Arqueiro.' },
  { id: 'a_ampm', cat: 'a', g: 4, n: 'Gema do Sábio Eterno',       o: 'Técnica de Amp. Mágica',          k: 'ampM', v: 8,   u: '%',  d: 'Aumenta o dano das HABILIDADES das classes mágicas: Mago e Pierrot.' },
  { id: 'a_cmax', cat: 'a', g: 3, n: 'Gema do Horizonte Infinito', o: 'Taxa Crítica Máxima',             k: 'cmax', v: 2,   u: '%',  d: 'Aumenta o limite máximo da chance de crítico (normalmente 52%, no máximo 95%).' },
  { id: 'a_crit', cat: 'a', g: 4, n: 'Gema da Visão Aguçada',      o: 'Taxa Crítica',                    k: 'crit', v: 2,   u: '%',  d: 'Aumenta a chance de acerto crítico.' },
  { id: 'a_hp',   cat: 'a', g: 0, n: 'Gema da Vida Plena',         o: 'HP',                              k: 'hp',   v: 2,   sc: 1,  d: 'Aumenta a vida máxima. Cresce com o nível do equipamento.' },
  { id: 'a_mp',   cat: 'a', g: 0, n: 'Gema da Mente Clara',        o: 'MP',                              k: 'mp',   v: 1.5, sc: 1,  d: 'Aumenta a mana máxima. Cresce com o nível do equipamento.' },
  { id: 'a_def',  cat: 'a', g: 1, n: 'Gema da Muralha',            o: 'Defesa',                          k: 'def',  v: .5,  sc: 1,  d: 'Aumenta a defesa. Cresce com o nível do equipamento.' },
  { id: 'a_drate',cat: 'a', g: 2, n: 'Gema do Baluarte',           o: 'Taxa de Defesa',                  k: 'drate',v: 1.5, u: '%',  d: 'Chance de bloquear por completo um ataque (reduzida pelo "Ignorar Bloqueio" do adversário).' },
  { id: 'a_eva',  cat: 'a', g: 2, n: 'Gema do Vento Ligeiro',      o: 'Evasão',                          k: 'eva',  v: .8,  u: '%',  d: 'Aumenta a chance de esquivar de ataques (reduzida pelo Acerto do adversário).' },
  { id: 'a_lhp',  cat: 'a', g: 2, n: 'Gema Sanguínea',             o: 'Absorção de HP',                  k: 'lhp',  v: .5,  u: '%',  d: 'Você recupera vida igual a uma parte do dano que causa a cada golpe.' },
  { id: 'a_lmp',  cat: 'a', g: 1, n: 'Gema Lunar',                 o: 'Absorção de MP',                  k: 'lmp',  v: .3,  u: '%',  d: 'Você recupera mana igual a uma parte do dano que causa.' },
  { id: 'a_rhp',  cat: 'a', g: 1, n: 'Gema da Seiva Viva',         o: 'Regeneração de HP',               k: 'rhp',  v: .15, u: '%/s', d: 'Recupera vida a cada segundo, inclusive em combate.' },
  // ---------- NOVOS: ARMA ----------
  { id: 'w_hit',   cat: 'w', g: 2, n: 'Gema da Mira Perfeita',          o: 'Acerto',                                  k: 'acc',      v: 2,   u: '%', d: 'Reduz a Evasão do adversário em PvP (cada 1% de Acerto tira 1% da Evasão dele).' },
  { id: 'w_ircr',  cat: 'w', g: 3, n: 'Gema do Caçador Implacável',     o: 'Ignorar Resistência à Taxa Crítica',      k: 'ignRcrit', v: 2,   u: '%', d: 'Diminui a Resistência à Taxa Crítica do adversário (PvP).' },
  { id: 'w_ircd',  cat: 'w', g: 3, n: 'Gema do Golpe Devastador',       o: 'Ignorar Resistência ao Dano Crítico',     k: 'ignRcdmg', v: 3,   u: '%', d: 'Diminui a Resistência ao Dano Crítico do adversário (PvP).' },
  { id: 'w_irdm',  cat: 'w', g: 2, n: 'Gema do Rompe-Escudo',           o: 'Ignorar Redução de Danos',                k: 'ignRdmg',  v: .25, sc: 1, d: 'Diminui a Redução de Danos do adversário (PvP). Cresce com o nível do equipamento.' },
  { id: 'w_irbl',  cat: 'w', g: 2, n: 'Gema do Quebra-Guarda',          o: 'Ignorar Bloqueio',                        k: 'ignBlock', v: 2,   u: '%', d: 'Diminui a Taxa de Defesa (bloqueio) do adversário (PvP).' },
  // ---------- NOVOS: ARMADURA ----------
  { id: 'a_irpe',  cat: 'a', g: 3, n: 'Gema da Pele de Pedra',          o: 'Ignorar Perfuração',                      k: 'ignPen',   v: 2,   u: '%', d: 'Reduz a Perfuração do adversário contra você (PvP).' },
  { id: 'a_irac',  cat: 'a', g: 2, n: 'Gema do Olhar Turvo',            o: 'Ignorar Acerto',                          k: 'ignAcc',   v: 2,   u: '%', d: 'Reduz o Acerto do adversário contra você (PvP).' },
  { id: 'a_rdmg',  cat: 'a', g: 1, n: 'Gema da Pele Grossa',            o: 'Redução de Danos',                        k: 'rdmg',     v: .25, sc: 1, d: 'Diminui uma quantidade fixa do dano de cada golpe recebido (mínimo 1). Cresce com o nível do equipamento.' },
  { id: 'a_rcrt',  cat: 'a', g: 3, n: 'Gema do Escudo Firme',           o: 'Resistência à Taxa Crítica',              k: 'rcrit',    v: 1.5, u: '%', d: 'Reduz a chance de o adversário acertar críticos em você (PvP).' },
  { id: 'a_rcdm',  cat: 'a', g: 3, n: 'Gema da Couraça Rubra',          o: 'Resistência ao Dano Crítico',             k: 'rcdmg',    v: 3,   u: '%', d: 'Reduz o dano extra dos críticos que você recebe (PvP).' },
  { id: 'a_ramp',  cat: 'a', g: 3, n: 'Gema do Véu Arcano',             o: 'Resistência à Técnica Amp.',              k: 'ramp',     v: 3,   u: '%', d: 'Reduz a Técnica de Amp. das habilidades do adversário contra você (PvP).' },
  { id: 'a_lhpu',  cat: 'a', g: 3, n: 'Gema da Sede Rubra',             o: 'Aumento de Absorção de HP',               k: 'lhpUp',    v: 1,   u: '%', d: 'Soma % à Absorção de HP. Com pelo menos 2% aqui, o Limite de Absorção de HP passa a funcionar.' },
  { id: 'a_lmpu',  cat: 'a', g: 2, n: 'Gema da Sede Azul',              o: 'Aumento de Absorção de MP',               k: 'lmpUp',    v: .5,  u: '%', d: 'Soma % à Absorção de MP. Com pelo menos 2% aqui, o Limite de Absorção de MP passa a funcionar.' },
  { id: 'a_lhpl',  cat: 'a', g: 2, n: 'Gema do Cálice Vital',           o: 'Aumento do Limite de Absorção de HP',     k: 'lhpLim',   v: .2,  sc: 1, d: 'A cada golpe, recupera esse tanto de HP por monstro atingido. Só funciona com pelo menos 2% de Aumento de Absorção de HP.' },
  { id: 'a_lmpl',  cat: 'a', g: 1, n: 'Gema do Cálice Arcano',          o: 'Aumento do Limite de Absorção de MP',     k: 'lmpLim',   v: .15, sc: 1, d: 'A cada golpe, recupera esse tanto de MP por monstro atingido. Só funciona com pelo menos 2% de Aumento de Absorção de MP.' }];
/** Teto da SOMA de cada bônus (todas as gemas equipadas) • GCAPL = teto por nível do personagem */
const GCAP = { ampE: 45, ampM: 45, crit: 30, cdmg: 60, cmax: 20, pen: 30, drate: 25, eva: 12, lhp: 10, lmp: 6, rhp: 3, acc: 30, ignPen: 30, ignAcc: 30, ignRcrit: 30, ignRcdmg: 40, ignBlock: 25, rcrit: 30, rcdmg: 40, ramp: 40, lhpUp: 6, lmpUp: 3 };
const GCAPL = { hp: 20, mp: 15, def: 4, rdmg: 1.5, ignRdmg: 1.5, lhpLim: 1.2, lmpLim: .9 };
const CRIT_CAP = 52;   // taxa crítica máxima base (%) — sobe com "Taxa Crítica Máxima", no máximo 95%
const GEMD = {};
for (const g of GEMS) { GEMD[g.id] = g; MATS['g_' + g.id] = { n: g.n, i: '📜', v: Math.round(GRADES[g.g].p * .1), gem: g.id }; }
MATS.g_ext = { n: 'Extensor de Slot', i: '🔳', v: Math.round(EXT_PRICE * .1), ext: 1 };
const gemVal = (g, ilvl) => g.sc ? Math.max(1, Math.round(g.v * ilvl)) : g.v;
const gemTxt = (g, ilvl) => '+' + gemVal(g, ilvl).toLocaleString('pt-BR') + (g.u || '');
const gemCat = it => it && (it.slot === 'weapon' || it.slot === 'ring') ? 'w' : 'a';   // anéis contam como ARMA para as gemas
/** escola de habilidades da classe: 'E' = física (Espada) • 'M' = mágica */
const schoolOf = cls => (cls === 'mago' || cls === 'pierrot') ? 'M' : 'E';
/** ATRIBUTOS DE ITEM (fora do engaste): só vêm em drops de CHEFE. it.xa = { cdmg | ampE | ampM | cmax : valor }.
 *  p = chance (por equipamento de chefe) • v = valores possíveis (sorteados com peso 50/35/15) */
const XA = { cdmg: { p: .10, v: [8, 10, 16], n: 'Dano Crítico' }, amp: { p: .05, v: [4, 6, 8], n: 'Técnica de Amp.' }, cmax: { p: .05, v: [1, 2, 3], n: 'Taxa Crítica Máxima' } };
const XA_W = [.5, .85, 1];
const xaOk = (k, v) => (k === 'cdmg' && XA.cdmg.v.includes(v)) || ((k === 'ampE' || k === 'ampM') && XA.amp.v.includes(v)) || (k === 'cmax' && XA.cmax.v.includes(v));
const xaName = k => k === 'cdmg' ? 'Dano Crítico' : k === 'cmax' ? 'Taxa Crítica Máxima' : k === 'ampM' ? 'Técnica de Amp. Mágica' : 'Técnica de Amp. Espada';
/** Rola os atributos de item de um equipamento dropado por chefe (cada um é sorteado separadamente). */
function rollBossAttr(it, cls) {
  if (!it || it.k !== 'eq' || it.slot === 'cape') return it;
  const tier = () => { const r = Math.random(); return r < XA_W[0] ? 0 : r < XA_W[1] ? 1 : 2; };
  const xa = {};
  if (Math.random() < XA.cdmg.p) xa.cdmg = XA.cdmg.v[tier()];
  if (Math.random() < XA.amp.p) xa[schoolOf(cls || it.cls) === 'M' ? 'ampM' : 'ampE'] = XA.amp.v[tier()];
  if (Math.random() < XA.cmax.p) xa.cmax = XA.cmax.v[tier()];
  if (Object.keys(xa).length) it.xa = xa;
  return it;
}
/** soma dos bônus das gemas dos itens EQUIPADOS (já com os tetos) */
function gemTotals(c) {
  const t = { ampE: 0, ampM: 0, crit: 0, cdmg: 0, cmax: 0, atkE: 0, atkM: 0, pen: 0, add: 0, hp: 0, mp: 0, def: 0, drate: 0, eva: 0, lhp: 0, lmp: 0, rhp: 0, acc: 0, ignPen: 0, ignAcc: 0, ignRcrit: 0, ignRcdmg: 0, ignBlock: 0, ignRdmg: 0, rdmg: 0, rcrit: 0, rcdmg: 0, ramp: 0, lhpUp: 0, lmpUp: 0, lhpLim: 0, lmpLim: 0 };
  for (const k in c.eq) { const it = c.eq[k]; if (!it) continue; if (it.xa) for (const x in it.xa) if (x in t && xaOk(x, it.xa[x])) t[x] += it.xa[x];   // atributo de item (drop de chefe)
    if (!Array.isArray(it.gm)) continue; for (const id of it.gm) { const g = id && GEMD[id]; if (g) t[g.k] += gemVal(g, it.ilvl); } }
  for (const k in GCAP) t[k] = Math.min(t[k], GCAP[k]);
  for (const k in GCAPL) t[k] = Math.min(t[k], GCAPL[k] * Math.max(1, c.level || 1));
  return t;
}
/** Sorteia um pergaminho (drops raros). Graus altos são muito mais raros; evita gemas que a classe não usa (80%). */
function rollScroll(cls, mlvl) {
  const W = mlvl >= 90 ? [24, 28, 22, 16, 10] : mlvl >= 55 ? [34, 30, 20, 11, 5] : [46, 32, 15, 5, 2];
  let r = Math.random() * W.reduce((a, b) => a + b, 0), g = 0; for (; g < 4; g++) { if (r < W[g]) break; r -= W[g]; }
  const sc = schoolOf(cls); let pool = GEMS.filter(x => x.g === g && !((sc === 'M' && (x.k === 'ampE' || x.k === 'atkE')) || (sc === 'E' && (x.k === 'ampM' || x.k === 'atkM'))));
  if (!pool.length || Math.random() < .2) pool = GEMS.filter(x => x.g === g);
  return { k: 'mat', id: 'g_' + pick(pool).id, n: 1 };
}

/* ---------- CONJUNTOS (sets): peças com a mesma ORIGEM (mo) somam bônus a cada 2/4/6 peças ---------- */
const OGK = {};     // chave canônica da origem (dg_a = múmia, dg_boss = faraó ...)
for (const k in OG) OGK[k] = Object.keys(OG).find(x => OG[x] === OG[k]);
/** n = peças necessárias • b = bônus (valores em % ou pontos, multiplicados pelo "tier" da origem) */
const SETB = {
  fire:      [{ n: 2, b: { dmgP: 4 } },            { n: 4, b: { crit: 4, cdmg: 10 } },     { n: 6, b: { ampX: 8, pen: 5 } }],
  ice:       [{ n: 2, b: { hpP: 5 } },             { n: 4, b: { defP: 6, eva: 2 } },       { n: 6, b: { drate: 5, rhp: .4 } }],
  poison:    [{ n: 2, b: { pen: 3 } },             { n: 4, b: { dmgP: 5, lhp: 1 } },       { n: 6, b: { ampX: 6, cdmg: 15 } }],
  lightning: [{ n: 2, b: { aspd: 4 } },            { n: 4, b: { crit: 4, aspd: 4 } },      { n: 6, b: { ampX: 8, eva: 3 } }],
  gold:      [{ n: 2, b: { gf: 10 } },             { n: 4, b: { gf: 10, dmgP: 3 } },       { n: 6, b: { gf: 15, hpP: 6 } }],
  soul:      [{ n: 2, b: { mpP: 6 } },             { n: 4, b: { lmp: 1, rhp: .2 } },       { n: 6, b: { ampX: 6, lhp: 1.5 } }],
  shadow:    [{ n: 2, b: { crit: 3 } },            { n: 4, b: { cdmg: 15, eva: 2 } },      { n: 6, b: { dmgP: 6, pen: 5 } }]};
/** rótulo e unidade de cada bônus de conjunto */
const BLAB = { dmgP: ['Dano', '%'], hpP: ['Vida máxima', '%'], mpP: ['Mana máxima', '%'], defP: ['Defesa', '%'], aspd: ['Velocidade de ataque', '%'], gf: ['Ouro obtido', '%'], crit: ['Taxa Crítica', '%'], cdmg: ['Dano Crítico', '%'], ampX: ['Amp. de habilidades', '%'], pen: ['Perfuração', '%'], eva: ['Evasão', '%'], drate: ['Taxa de Defesa', '%'], rhp: ['Regeneração de HP', '%/s'], lhp: ['Absorção de HP', '%'], lmp: ['Absorção de MP', '%'] };
/** quanto o conjunto vale: origens de monstros mais fortes dão bônus maiores (0,5× a 1,6×) */
const setTf = key => { const m = MT[key]; const L = m && m.lv ? m.lv[0] : 30; return Math.max(.5, Math.min(1.6, .5 + L / 90)); };
const setVal = (v, tf) => Math.round(v * tf * 10) / 10;
function setCounts(c) { const n = {}; for (const k in c.eq) { const it = c.eq[k]; if (it && it.mo && OGK[it.mo]) n[OGK[it.mo]] = (n[OGK[it.mo]] || 0) + 1; } return n; }
/** conjuntos do personagem: tot = soma dos bônus ativos • act = lista de conjuntos com ≥ 2 peças */
function setBonus(c) {
  const tot = {}, act = [], cnt = setCounts(c);
  for (const key in cnt) {
    const n = cnt[key]; if (n < 2) continue; const og = OG[key], tf = setTf(key), on = [];
    for (const t of SETB[og.el] || []) if (n >= t.n) { on.push(t.n); for (const k in t.b) tot[k] = (tot[k] || 0) + setVal(t.b[k], tf); }
    act.push({ key, name: og.sf, el: og.el, n, on, tf });
  }
  return { tot, act };
}
/** descrição de um conjunto (para a janela de item): cada degrau com o texto do bônus */
function setInfo(key, have) {
  const og = OG[OGK[key] || key]; if (!og) return null; const tf = setTf(OGK[key] || key);
  return { name: 'Conjunto ' + og.sf, col: og.col, tiers: (SETB[og.el] || []).map(t => ({ n: t.n, on: have >= t.n, txt: Object.keys(t.b).map(k => '+' + setVal(t.b[k], tf) + (BLAB[k][1] === '%/s' ? '%/s' : '%') + ' ' + BLAB[k][0]).join(' • ') })) };
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
  gelo: [
    { id: 'capa3', i: '🧥', n: 'Capa Glacial (Nv 90)', d: 'Capa vermelha — Tanque, Guerreiro e Cavaleiro Pesado. Sem raridade, atributos fixos; brilha junto com a sua armadura.', c: () => 180000, mk: () => genCape(90, 'guerreiro') },
    { id: 'estola3', i: '🧣', n: 'Estola Glacial (Nv 90)', d: 'Estola azul fina — Arqueiro, Mago e Pierrot. Sem raridade, atributos fixos; brilha junto com a sua armadura.', c: () => 180000, mk: () => genCape(90, 'mago') },
    { id: 'manto3', i: '🥷', n: 'Manto Glacial (Nv 90)', d: 'Manto encapuzado — só para o Assassino. Sem raridade, atributos fixos; brilha junto com a sua armadura.', c: () => 180000, mk: () => genCape(90, 'assassino') },
    { id: 'hp3', i: '🍷', n: 'Poção de Vida Superior', d: 'Recupera 70% da vida', c: () => 140, mk: () => ({ k: 'pot', id: 'hp2', n: 1 }) },
    { id: 'mp3', i: '💧', n: 'Poção de Mana Superior', d: 'Recupera 70% da mana', c: () => 140, mk: () => ({ k: 'pot', id: 'mp2', n: 1 }) },
    { id: 'hp3x5', i: '🍷', n: 'Poção de Vida Superior ×5', d: 'Pacote da nevasca', c: () => 620, mk: () => ({ k: 'pot', id: 'hp2', n: 5 }) },
    { id: 'mp3x5', i: '💧', n: 'Poção de Mana Superior ×5', d: 'Pacote da nevasca', c: () => 620, mk: () => ({ k: 'pot', id: 'mp2', n: 5 }) },
    { id: 'box3', i: '🎁', n: 'Caixa Glacial', d: 'Equipamento de nível 75+ (qualquer peça). Boas chances de raro/épico.', c: c => 30000 + c.level * 300, box: 1, mk: c => genItem(pick(slotPool(c.cls)), Math.max(75, c.level) + ri(0, 3), rarRoll(1.5), undefined, c.cls, 0, true) },
    { id: 'boxw3', i: '⚔️', n: 'Caixa de Arma Glacial', d: 'Uma arma da SUA classe, nível 78+.', c: c => 60000 + c.level * 500, box: 1, mk: c => genItem('weapon', Math.max(78, c.level + 2) + ri(0, 3), rarRoll(2), c.cls, c.cls, 0, true) },
    { id: 'boxe3', i: '👑', n: 'Caixa Eterna', d: 'Equipamento de nível 90+ com chance muito alta de raro e épico.', c: () => 250000, box: 1, mk: c => genItem(pick(slotPool(c.cls)), Math.max(90, c.level + 4) + ri(0, 4), rarRoll(4), undefined, c.cls, 0, true) }],
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

/** Loja dos gemólogos: pergaminhos de opção (por categoria e grau) + extensor de slot. `sec` agrupa na tela. */
SHOPS.scr = [
  ...[['w', 'Pergaminhos de ARMA'], ['a', 'Pergaminhos de ARMADURA / ACESSÓRIOS']].flatMap(([cat, title]) =>
    GRADES.flatMap((gr, gi) => GEMS.filter(g => g.cat === cat && g.g === gi).map(g => ({ id: 'g_' + g.id, i: '📜', n: g.n, sec: title + ' — ' + gr.n + ' (' + gr.en + ')', scr: g.id, d: g.o + ' ' + (g.sc ? '+' + g.v + ' × nível do item' : '+' + g.v + (g.u || '')), c: () => gr.p, mk: () => ({ k: 'mat', id: 'g_' + g.id, n: 1 }) })))),
  { id: 'g_ext', i: '🔳', n: 'Extensor de Slot', sec: 'Extensor de Slot', d: 'Cria +1 engaste ◇ em um equipamento (até ' + MAX_SLOTS + ' engastes). Use na aba Engastar.', c: () => EXT_PRICE, mk: () => ({ k: 'mat', id: 'g_ext', n: 1 }) }];

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
  purgeExp(c);
  const C = CLASSES[c.cls];
  const st = { str: C.base.str + c.alloc.str, agi: C.base.agi + c.alloc.agi, int: C.base.int + c.alloc.int, vit: C.base.vit + c.alloc.vit };
  const gm = (c.gmu || 0) > Date.now();   // Buff do GM: +100 atributos, +1000 vida/mana, +200 dano/defesa
  let atk = 0, def = 0, hp = 0;
  for (const k in c.eq) { const it = c.eq[k]; if (!it) continue; atk += eff(it, 'atk'); def += eff(it, 'def'); hp += it.hp || 0; for (const s in it.bon) st[s] += it.bon[s]; }
  if (c.gm) for (const k of ['str', 'agi', 'int', 'vit']) st[k] *= 20;   // GM: atributos ×20
  if (gm) { st.str += 100; st.agi += 100; st.int += 100; st.vit += 100; }
  const kn = c.cls === 'cavaleiro', as = c.cls === 'assassino', tk = c.cls === 'tanque', pr = c.cls === 'pierrot';
  // gemas engastadas + bônus de conjunto (peças com a mesma origem)
  const sch = schoolOf(c.cls), G = gemTotals(c), SB = setBonus(c).tot, sb = k => SB[k] || 0;
  atk += sch === 'M' ? G.atkM : G.atkE; def += G.def; hp += G.hp;
  return { ...st, gm, atk, def: (def + st.vit * .4) * (tk ? 1.75 : kn ? 1.4 : pr ? .8 : 1) * (1 + sb('defP') / 100) + (gm ? 200 : 0), hpBonus: hp,
    maxHp: Math.round((50 + st.vit * 10 + c.level * 8 + hp) * (tk ? 1.3 : kn ? 1.15 : as ? .9 : pr ? .85 : 1) * (1 + sb('hpP') / 100)) + (gm ? 1000 : 0),
    maxMp: Math.round((30 + st.int * 5 + c.level * 3 + (C.main === 'int' ? 20 : 0) + (kn ? 25 : as ? 20 : tk ? 15 : pr ? 10 : 0) + G.mp) * (1 + sb('mpP') / 100)) + (gm ? 1000 : 0),
    dmg: (st[C.main] * (tk ? .8 : 1.0) + atk + c.level * 1.2) * (tk ? .85 : pr ? .85 : 1) * (1 + sb('dmgP') / 100) + (gm ? 200 : 0),
    luck: pr ? Math.round((10 + c.level * .3 + st.agi * .05) * 10) / 10 : 0, critMul: (pr ? 2.1 : 1.7) + (G.cdmg + sb('cdmg')) / 100,
    // Retornos decrescentes: crítico/esquiva/velocidade nunca disparam, por mais pontos que se invista.
    crit: 3 + (as ? 6 : 0) + (pr ? 11 : 0) + 38 * st.agi / (st.agi + 200) + G.crit + sb('crit'),   // v1.62: base, bônus de classe e AGI reduzidos; gemas e conjuntos iguais
    dodge: 25 * st.agi / (st.agi + 250) + G.eva + sb('eva'),
    atkSpd: (1 + .8 * st.agi / (st.agi + 300)) * (as ? 1.2 : 1) * (1 + sb('aspd') / 100),
    // novos (gemas/conjuntos): amp de habilidades, penetração, dano adicional, teto de crítico, redução de dano, absorção e regeneração
    amp: ((sch === 'M' ? G.ampM : G.ampE) + sb('ampX')) / 100, pen: Math.min(.6, (G.pen + sb('pen')) / 100), add: G.add, cmax: G.cmax,
    drate: Math.min(.5, (G.drate + sb('drate')) / 100), lhp: (G.lhp + G.lhpUp + sb('lhp')) / 100, lmp: (G.lmp + G.lmpUp + sb('lmp')) / 100, rhp: (G.rhp + sb('rhp')) / 100, gf: sb('gf') / 100,
    // atributos de pergaminho (v1.40)
    critCap: Math.min(95, CRIT_CAP + G.cmax), acc: G.acc, ignPen: G.ignPen, ignAcc: G.ignAcc, ignRcrit: G.ignRcrit, ignRcdmg: G.ignRcdmg, ignBlock: G.ignBlock, ignRdmg: Math.round(G.ignRdmg),
    rdmg: Math.round(G.rdmg), rcrit: G.rcrit, rcdmg: G.rcdmg, ramp: G.ramp, lhpUp: G.lhpUp, lmpUp: G.lmpUp, lhpLim: G.lhpUp >= 2 ? Math.round(G.lhpLim) : 0, lmpLim: G.lmpUp >= 2 ? Math.round(G.lmpLim) : 0, lhpLimRaw: Math.round(G.lhpLim), lmpLimRaw: Math.round(G.lmpLim) };
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
  { const sp = specOf(c); if (sp) out.push({ id: 'sp:' + sp.id, t: sp.t, col: sp.c, dg: 'Caminho', icon: sp.i, need: 1, cur: 1, have: true, desc: 'Caminho escolhido: ' + sp.n }); }
  const b = brightProg(c); out.push({ id: 'bright', t: 'O mais brilhante', col: TCOL.bright, dg: 'Aprimoramento', icon: '✨', need: b.total, cur: b.n, have: !!c.tb, desc: 'Todas as peças equipadas em +10 (a capa não conta)' });
  return out;
}
const titleInfo = id => { if (id === 'bright') return { t: 'O mais brilhante', col: TCOL.bright, bright: 1 };
  if (String(id).startsWith('sp:')) { for (const k in SPECS) { const sp = SPECS[k].find(x => 'sp:' + x.id === id); if (sp) return { t: sp.t, col: sp.c }; } return null; } const [d, st] = String(id).split(':'), dg = DUNGEONS.find(x => x.id === d); return dg && dg.titles && dg.titles[st] ? { t: dg.titles[st], col: TCOL[st] || '#fff' } : null; };
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
const BCAP = { flat: 1000, aspd: .6, defloss: .6, shield: .75, evade: .6, haste: 1, crit: .8, dmg: 1.2, defdmg: 2.5, luck: 1.2 };
/* dano em área: habilidades que acertam vários alvos causam 30% menos dano (AOE_K) e a área (raio, e a marcação no chão junto) fica 20% menor (AOE_R) */
const AOE_K = .7, AOE_R = .8, AOE_T = { aoeSelf: 1, aoeTarget: 1, aoeMulti: 1, thunder: 1, arcRay: 1, shieldThrow: 1, shieldBeam: 1, chainPull: 1, roll: 1, daggerFan: 1, starJump: 1, stab3: 1 };
function skStat(cls, i, rank) {
  const s = CLASSES[cls].skills[i], k = Math.max(1, rank || 0) - 1;
  const bf = {}; if (s.buffs) for (const a in s.buffs) bf[a] = Math.min(BCAP[a] || 9, s.buffs[a] * (s.fixBuff ? 1 : 1 + ph(k, .15, .05)));
  if (s.flatMin != null) bf.flat = s.flatMin + (s.flatMax - s.flatMin) * Math.min(1, k / (MAXRANK - 1));
  if (s.evMin != null && bf.evade != null) bf.evade = s.evMin + (s.evMax - s.evMin) * Math.min(1, k / (MAXRANK - 1));
  const cc = x => x ? Math.round(x * Math.min(1.6, 1 + .05 * k)) : 0;
  return { ...s, mult: s.mult ? s.mult * (1 + ph(k, .2, .08)) * (AOE_T[s.type] ? AOE_K : 1) : 0, mp: Math.round(s.mp * (1 + ph(k, .06, .03))), cd: s.cdMin != null ? s.cd - (s.cd - s.cdMin) * Math.min(1, k / (MAXRANK - 1)) : s.cd * (1 - Math.min(.5, ph(k, .04, .015))), radius: s.radius ? (s.radius + ph(k, .25, .1)) * (s.mult ? AOE_R : 1) : 0, pct: s.pct ? (s.fixPct ? s.pct : Math.min(.9, s.pct * (1 + ph(k, .15, .05)))) : 0, dur: s.dur ? (s.fixDur ? s.dur : s.dur * (1 + ph(k, .1, .03))) : 0, buffs: s.buffs ? bf : null, dag: s.dagMax ? s.dagMin + Math.round((s.dagMax - s.dagMin) * Math.min(1, k / (MAXRANK - 1))) : 0, slow: s.slow ? s.slow * (1 + ph(k, .1, .03)) : 0, defMult: s.defMult ? s.defMult * (1 + ph(k, .2, .08)) : 0, hits: s.hits ? s.hits + (k >= 4 ? 1 : 0) + (k >= 10 ? 1 : 0) + (k >= 16 ? 1 : 0) : 0, stun: s.fixStun ? s.stun : cc(s.stun), root: cc(s.root), lift: cc(s.lift), clones: s.cloneMult ? 1 + Math.floor(k / 4) : 0, cloneMult: s.cloneMult ? s.cloneMult * (1 + ph(k, .05, .02)) : 0 };
}

/** Dano de um golpe. d = stats(); o = {mult, defMult, exec, marked, buffs:{dmg,defdmg,crit,combo}}; mon = {def, hp, maxHp}. */
function hitDamage(d, o, mon) {
  const b = o.buffs || {}, V = mon.v || null;                         // V = atributos do DEFENSOR (só em PvP)
  const cres = V ? Math.max(0, (V.rcrit || 0) - (d.ignRcrit || 0)) : 0;   // Resistência à Taxa Crítica (menos o que o atacante ignora)
  const ccap = Math.min(.95, (d.critCap || (CRIT_CAP + (d.cmax || 0))) / 100);
  const crit = o.forceCrit || Math.random() < Math.min(ccap, (d.crit + (b.crit || 0) * 100 - cres) / 100);
  const base = d.dmg + (b.flat || 0) + (o.defMult ? d.def * o.defMult : 0) + (b.defdmg || 0) * d.def;
  let dmg = base * (1 + (b.dmg || 0)) * o.mult * rnd(.9, 1.1);
  const cmul = V ? 1 + ((d.critMul || 1.7) - 1) * (1 - Math.min(90, Math.max(0, (V.rcdmg || 0) - (d.ignRcdmg || 0))) / 100) : (d.critMul || 1.7);   // Resistência ao Dano Crítico
  if (crit) dmg *= cmul; if (o.marked) dmg *= 1.35; if (o.exec && mon.hp < mon.maxHp * .4) dmg *= 2; dmg *= (1 + (b.combo || 0));
  const amp = Math.max(0, (d.amp || 0) - (V ? (V.ramp || 0) / 100 : 0));   // Resistência à Técnica Amp.
  if (!o.basic && amp) dmg *= (1 + amp);                              // Técnica de Amp.: só habilidades, não o ataque básico
  const pen = Math.max(0, (d.pen || 0) - (V ? (V.ignPen || 0) / 100 : 0));   // Perfuração (menos o "Ignorar Perfuração" do defensor)
  const mdef = mon.def * (1 - pen);
  return { dmg: Math.max(1, Math.round(dmg * 100 / (100 + mdef * 2) + (d.add || 0))), crit };   // Dano Adicional: fixo, depois da defesa
}
/** Defesa contra UM ataque. V = atributos de quem recebe • A = atributos de quem ataca (null = monstro) • evB = buff de esquiva (0..1).
 *  Devolve 'dodge' (Evasão, reduzida pelo Acerto do atacante), 'block' (Taxa de Defesa, reduzida por "Ignorar Bloqueio") ou null. */
function defRoll(V, A, evB) {
  const acc = Math.max(0, ((A && A.acc) || 0) - (V.ignAcc || 0));
  if (Math.random() * 100 < Math.max(0, (V.dodge || 0) + (evB || 0) * 100 - acc)) return 'dodge';
  if (Math.random() * 100 < Math.max(0, (V.drate || 0) * 100 - ((A && A.ignBlock) || 0))) return 'block';
  return null;
}
/** Redução de Danos: tira um valor fixo do golpe recebido (menos o "Ignorar Redução de Danos" do atacante). Mínimo 1. */
const flatRed = (V, A, dmg) => Math.max(1, Math.round(dmg - Math.max(0, (V.rdmg || 0) - ((A && A.ignRdmg) || 0))));
/** Absorção por golpe em UM monstro atingido: % do dano + o limite fixo (que só existe com ≥2% de Aumento de Absorção). */
const leech = (d, dmg) => ({ hp: dmg * (d.lhp || 0) + (d.lhpLim || 0), mp: dmg * (d.lmp || 0) + (d.lmpLim || 0) });

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
/* cor do equipamento SEM origem de monstro: uma cor por "linha" (nível do item) — Pano, Couro, Ferro/Malha, Aço/Placas, Rúnico, Abissal, Dracônico, Solar, Faraônico, Imortal e as duas linhas finais */
const tierOf = ilvl => ilvl >= 120 ? 11 : ilvl >= 90 ? 10 : ilvl >= 68 ? 9 : ilvl >= 56 ? 8 : ilvl >= 44 ? 7 : Math.min(6, Math.floor(ilvl / 4));
const TIERC = ['#cdbb93', '#9a6536', '#8d98a8', '#4f8fd6', '#22c4a6', '#3d3aa8', '#d8342a', '#f2b632', '#ff7a1a', '#eef2f8', '#e04fb8', '#74e044'];
const TIERC2 = ['#7d6f52', '#553314', '#4d5562', '#234a7a', '#0f6a5a', '#1a1858', '#701510', '#8a6210', '#8a3a06', '#8a94a6', '#7a1f60', '#2f7a14'];
function apOf(c) { const o = []; for (const k in c.eq) { const it = c.eq[k]; if (it) o.push(k + '|' + (it.mo || '') + '|' + (it.plus || 0) + '|' + it.rar + '|' + (it.ilvl || 0)); } return o.join(';'); }
/** Dungeons: itens raros/épicos têm 40% de chance de vir com um atributo extra (For/Agi/Int/Vit). */
function dgAttrBoost(it) { if (it.rar >= 2 && Math.random() < .4) { const st = ['str', 'agi', 'int', 'vit'], k = pick(st); it.bon[k] = (it.bon[k] || 0) + Math.max(1, Math.round(it.ilvl / 3)); } }
function rollLoot(T, mlvl, cls, luck) {
  luck = luck || 0;
  const out = [];
  out.push({ k: 'gold', n: Math.round(ri(T.gold[0], T.gold[1]) * (1 + (mlvl - T.lv[0]) * .2)) });
  for (const id in T.mats) if (Math.random() < T.mats[id]) out.push({ k: 'mat', id, n: ri(1, T.matMax || 2) });
  if (Math.random() < T.eq * (1 + luck / 100) * (T.dg ? 1.3 : 1)) { const slot = pick(slotPool(cls)); let rar = rarRoll((T.rb || 0) + (T.dg ? .35 : 0) + luck / 50); if (T.boss) rar = Math.max(2, rar); const lk = 1 + luck / 50, sl = T.dg ? (Math.random() < .022 * lk ? 2 : Math.random() < .11 * lk ? 1 : 0) : 0; { const it = genItem(slot, Math.max(1, mlvl + ri(T.dg ? 1 : 0, 2)), rar, undefined, cls, sl, T.id); if (luck > 0 && rar === 3) it.plus = ri(0, 4); if (T.dg) dgAttrBoost(it); if (T.boss) rollBossAttr(it, cls); out.push(it); } }
  if (mlvl >= 6 && Math.random() < (T.boss ? .05 : T.dg ? .004 : .0025) * (1 + luck / 100)) out.push(genCape(mlvl + ri(0, 2), cls));
  if (T.boss && !T.chest && Math.random() < (T.dg ? .035 : .02) * (1 + luck / 100)) out.push(rollScroll(cls, mlvl));   // pergaminho de opção: chance mínima em chefes
  if (Math.random() < T.pot) out.push({ k: 'pot', id: (Math.random() < .65 ? 'hp' : 'mp') + (T.lv[0] >= 50 ? '2' : ''), n: ri(1, T.boss ? 4 : 1) });
  return out;
}

/** Loot de um baú de dungeon (tier 1..3). Pode ser bom OU ruim: nível menor, raridade comum e sem slot. */
function dgChestLoot(dg, tier, cls, luck) {
  luck = luck || 0; const lk = 1 + luck / 50;
  const out = [], mk = (bad) => {
    const ilvl = Math.max(1, ri(dg.ilvl[0], dg.ilvl[1]) + (tier - 1) - (bad ? ri(8, 16) : 0));
    const rar = bad ? (Math.random() < .75 ? 0 : 1) : rarRoll([.7, 1.3, 2.4][tier - 1] + .3 + luck / 50);
    const p2 = bad ? 0 : [.09, .15, .26][tier - 1] * lk, p1 = bad ? .04 : [.34, .42, .48][tier - 1] * lk, r = Math.random();
    const sl = r < p2 ? 2 : r < p2 + p1 ? 1 : 0;
    const mo = Math.random() < .7 ? (dg.cm || ['dg_s1', 'dg_s2', 'dg_boss'])[tier - 1] : pick(dg.mm || ['dg_a', 'dg_b', 'dg_c', 'dg_d']);
    const it = genItem(pick(slotPool(cls)), ilvl, rar, undefined, cls, sl, mo); if (luck > 0 && rar === 3) it.plus = ri(0, 4); if (!bad) dgAttrBoost(it); return it;
  };
  out.push(mk(Math.random() < [.30, .22, .12][tier - 1] / (1 + luck / 100)));
  if (tier === 3 && Math.random() < .4) out.push(mk(false));
  if (Math.random() < [.02, .04, .1][tier - 1] * (1 + luck / 100)) out.push(genCape(ri(dg.ilvl[0], dg.ilvl[1]), cls));
  out.push({ k: 'gold', n: ri(600, 1100) * tier });
  if (Math.random() < .5) out.push({ k: 'mat', id: 'essencia', n: ri(1, 1 + tier) });
  if (Math.random() < [.01, .02, .05][tier - 1] * (1 + luck / 100)) out.push(rollScroll(cls, dg.ilvl[1]));   // pergaminho de opção (raro)
  return out;
}
function gainXp(c, n) { c.xp += n; let up = 0; while (c.xp >= xpNeed(c.level)) { c.xp -= xpNeed(c.level); c.level++; c.pts += PTS_PER_LEVEL; c.sp++; up++; } return up; }
const npcById = id => NPCS.find(n => n.id === id);
function questKill(c, type) {
  const out = [];
  for (const q of QUESTS) { const st = c.quests[q.id]; if (st && !st.done && q.tg === type && st.n < q.qty) { st.n++; if (st.n >= q.qty) out.push({ toast: 'Missão concluída: ' + q.t, sfx: 'questDone', log: `<span style="color:#6fdc7f">📜 Missão "${q.t}" pronta! Fale com ${npcById(q.npc).name}.</span>` }); } }
  return out;
}

/* ====================== MISSÕES DIÁRIAS E SEMANAIS ======================
   Reiniciam às 04:00 (horário de Brasília). Cada personagem tem 5 missões por dia e 4 por semana (sorteadas de uma lista;
   a lista do dia é igual para todos da mesma faixa de nível). Cada missão concluída dá XP e ouro, e enche a barra de baús
   (Bronze / Prata / Ouro). Os valores acompanham o nível do personagem.
   c.dq / c.wq = { k: chave do período, q: [{ id, n, need, done, got, xp, gold, reg? }], pts, ch: [baú recebido ×3] }            */
const RESET_UTC_MS = 7 * 3600e3;                                       // 04:00 em Brasília (UTC−3)
const dayKey = t => Math.floor((t - RESET_UTC_MS) / 86400e3);
const weekKey = t => Math.floor((dayKey(t) + 3) / 7);                  // a semana começa na segunda-feira, 04:00
const dayEnd = t => (dayKey(t) + 1) * 86400e3 + RESET_UTC_MS;
const weekEnd = t => ((weekKey(t) + 1) * 7 - 3) * 86400e3 + RESET_UTC_MS;
const REGN = { 0: 'as Planícies de Aurora', 300: 'Solara', '-300': 'Nevasca' };
const regOf = x => (x < -150 ? -300 : x > 450 ? 600 : x > 150 ? 300 : 0);
const bandReg = L => (L < 50 ? 0 : L < 75 ? 300 : -300);
const dwGold = L => Math.round((4000 + L * L * 45) / 100) * 100;      // ouro-base por nível (nível 100 ≈ 454 mil)
const DWT = {   // q(L, semanal) = quantidade • rw = peso da recompensa • min = nível mínimo
  kill:  { i: '⚔️', t: 'Caçada', d: n => `Derrote ${n} monstros em qualquer lugar.`, ev: 'kill', q: (L, w) => w ? 220 + Math.round(L * 3) : 24 + Math.round(L * .36), rw: 1 },
  reg:   { i: '🗺️', t: 'Patrulha', d: (n, q) => `Derrote ${n} monstros em ${REGN[q.reg]}.`, ev: 'kill', q: (L, w) => w ? 160 + Math.round(L * 2.4) : 18 + Math.round(L * .3), rw: 1.1 },
  boss:  { i: '👹', t: 'Caçador de Chefes', d: n => `Derrote ${n} chefes (de região ou de calabouço).`, ev: 'kill', q: (L, w) => w ? 10 : L < 30 ? 2 : 3, rw: 1.5 },
  dg:    { i: '🏺', t: 'Explorador de Calabouços', d: n => `Conclua ${n} calabouço${n > 1 ? 's' : ''}.`, ev: 'dg', q: (L, w) => w ? 3 : 1, rw: 2.2, min: 50 },
  wb:    { i: '☠️', t: 'Herói do Mundo', d: n => `Participe da derrota de ${n} Chefe${n > 1 ? 's' : ''} de Mundo.`, ev: 'wb', q: (L, w) => w ? 3 : 1, rw: 2.2 },
  enh:   { i: '⚒️', t: 'Mão de Ferreiro', d: n => `Aprimore equipamentos ${n} vez${n > 1 ? 'es' : ''} (com o Ferreiro).`, ev: 'enh', q: (L, w) => w ? 12 : 3, rw: 1 },
  craft: { i: '🔨', t: 'Forjador', d: n => `Forje ${n} item${n > 1 ? 'ns' : ''} (com o Ferreiro).`, ev: 'craft', q: (L, w) => w ? 8 : 2, rw: 1 },
  pot:   { i: '🧪', t: 'Alquimista', d: n => `Use ${n} poções.`, ev: 'pot', q: (L, w) => w ? 70 : 12, rw: .8 },
  sock:  { i: '💎', t: 'Lapidário', d: n => `Engaste ${n} gema${n > 1 ? 's' : ''} (com um Gemólogo).`, ev: 'sock', q: (L, w) => w ? 2 : 1, rw: 1.4, min: 60 }};
const DCH = [{ n: 'Bronze', need: 2, g: 2 }, { n: 'Prata', need: 4, g: 4 }, { n: 'Ouro', need: 5, g: 9 }];        // baú do dia: missões concluídas • g = × ouro-base
const WCH = [{ n: 'Bronze', need: 10, g: 14 }, { n: 'Prata', need: 22, g: 30 }, { n: 'Ouro', need: 36, g: 60 }];      // baú da semana: pontos (diária = 1, semanal = 4)
const dwHash = (a, b, c) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
const dwRng = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
function dwGen(c, w, key) {
  const L = Math.max(1, c.level | 0), rng = dwRng(dwHash(key, Math.floor(L / 25), w ? 7 : 3));
  const pool = Object.keys(DWT).filter(k => k !== 'kill' && L >= (DWT[k].min || 0)), ids = ['kill'];
  for (let n = w ? 3 : 4; n > 0 && pool.length; n--) ids.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  const q = ids.map(id => {
    const T = DWT[id], need = Math.max(1, T.q(L, w)), o = { id, n: 0, need, done: 0, got: 0,
      xp: Math.max(10, Math.round(xpNeed(L) * (w ? .2 : .025) * T.rw)), gold: Math.round(dwGold(L) * (w ? 8 : 1) * T.rw / 100) * 100 };
    if (id === 'reg') o.reg = bandReg(L);
    return o; });
  return { k: key, q, pts: 0, ch: [0, 0, 0] };
}
/** garante que as missões do personagem são do dia/da semana atual (sorteia novas quando passa das 04:00) */
function dwSync(c, now) {
  now = now || Date.now(); const dk = dayKey(now), wk = weekKey(now);
  if (!c.dq || c.dq.k !== dk) c.dq = dwGen(c, 0, dk);
  if (!c.wq || c.wq.k !== wk) c.wq = dwGen(c, 1, wk);
  return c;
}
/** um evento do jogo (abate, calabouço, aprimorar...) avança as missões do dia e da semana */
function dwEv(c, ev, a) {
  const out = []; if (!c) return out; dwSync(c); a = a || {};
  if (c.spq) out.push(...spEv(c, ev, a));                       // Provação dos Caminhos (nível 100)
  for (const w of [0, 1]) { const box = w ? c.wq : c.dq;
    for (const q of box.q) {
      if (q.done) continue; const T = DWT[q.id]; if (!T || T.ev !== ev) continue;
      if (q.id === 'reg' && regOf(a.x) !== q.reg) continue;
      if (q.id === 'boss' && !a.boss) continue;
      q.n = Math.min(q.need, q.n + 1);
      if (q.n >= q.need) {
        q.done = 1; box.pts += w ? 4 : 1; if (!w) c.wq.pts += 1;
        const tx = DWT[q.id].t;
        out.push({ gp: w ? GP.wq : GP.dq, toast: `${w ? '🗓️' : '📅'} Missão ${w ? 'semanal' : 'diária'} concluída: ${tx}!`, sfx: 'questDone', log: `<span style="color:#7fe0ff">${w ? '🗓️ Semanal' : '📅 Diária'} "${tx}" concluída! Receba a recompensa na janela de missões (<b>Q</b>).</span>` });
      }
    } }
  return out;
}

/* ====================== CAMINHOS DE ESPECIALIZAÇÃO (nível 100) ======================
   Cada classe tem 3 caminhos que vão mudar o ESTILO de luta. Por enquanto só a escolha existe (os estilos virão depois):
   o caminho vira um selo ao lado do nome e um título. Para liberar a escolha o jogador faz a Provação dos Caminhos.
   c.spec = id do caminho • c.spq = { on, k: monstros, d: calabouço, w: chefes de mundo, ok: provas cumpridas } */
const SPEC_LV = 100, SPEC_COST = 5e6, SPEC_RESET = 1e7;
const SPQ = { kills: 300, kmin: 85, dg: 'abismo', wb: 1 };
const SPECS = {
 guerreiro: [
  { id: 'rubra', n: 'Lâmina Rubra', i: '🩸', c: '#e04848', t: 'O Furioso', d: 'Abre mão de defesa em troca de fúria: golpes brutais, sangramento e velocidade de ataque.' },
  { id: 'comandante', n: 'Senhor da Guerra', i: '📯', c: '#e0a030', t: 'O General', d: 'Comanda o campo de batalha com gritos de guerra, bônus para o grupo e golpes devastadores em área.' },
  { id: 'dancarino', n: 'Dançarino de Aço', i: '🌪️', c: '#5fb4ff', t: 'O Duelista', d: 'Giros e investidas encadeados: mobilidade, combos de lâmina e movimentos sem pausa.' }],
 arqueiro: [
  { id: 'elite', n: 'Atirador de Elite', i: '🎯', c: '#ffd24a', t: 'O Preciso', d: 'Alcance máximo, crítico altíssimo e tiros que atravessam as defesas.' },
  { id: 'cacador', n: 'Caçador Selvagem', i: '🌿', c: '#6fcf6a', t: 'O Rastreador', d: 'Armadilhas, venenos e feras companheiras: controle do campo e dano em vários alvos.' },
  { id: 'elemental', n: 'Arqueiro Elemental', i: '☄️', c: '#b06aff', t: 'O Arcano', d: 'Flechas carregadas de fogo, gelo e raio, com um efeito especial a cada disparo.' }],
 mago: [
  { id: 'piromante', n: 'Piromante', i: '🔥', c: '#ff6a3a', t: 'Chama Viva', d: 'Fogo em área e queimaduras: dano explosivo e contínuo.' },
  { id: 'criomante', n: 'Criomante', i: '❄️', c: '#6fd0ff', t: 'Frio Eterno', d: 'Gelo e controle: lentidão, congelamento e barreiras geladas.' },
  { id: 'arcanista', n: 'Arcanista', i: '⚡', c: '#c58bff', t: 'Poder Puro', d: 'Arcano e raio: rajadas rápidas, mana abundante e feitiços encadeados.' }],
 assassino: [
  { id: 'sombra', n: 'Sombra Mortal', i: '🌑', c: '#8a7aff', t: 'O Silencioso', d: 'Furtividade e golpes críticos fulminantes, surgindo do nada.' },
  { id: 'veneno', n: 'Mestre dos Venenos', i: '☠️', c: '#5adf6a', t: 'O Peçonhento', d: 'Lâminas envenenadas e armadilhas: dano contínuo que se acumula no alvo.' },
  { id: 'fantasma', n: 'Lâmina Fantasma', i: '🌀', c: '#7fe0ff', t: 'O Intocável', d: 'Evasão e mobilidade extremas, com clones de sombra que confundem o inimigo.' }],
 cavaleiro: [
  { id: 'paladino', n: 'Paladino da Aurora', i: '✨', c: '#ffe28a', t: 'A Luz', d: 'Luz sagrada: proteção, cura de aliados e golpes que queimam os profanos.' },
  { id: 'lanceiro', n: 'Lanceiro Real', i: '🐎', c: '#ffb347', t: 'A Carga', d: 'Investidas devastadoras e golpes de impacto: o cavaleiro que ataca primeiro.' },
  { id: 'sombrio', n: 'Cavaleiro Sombrio', i: '🌘', c: '#b07aff', t: 'A Sombra', d: 'Poder sombrio: drena a vida dos inimigos e troca defesa por dano.' }],
 tanque: [
  { id: 'bastiao', n: 'Bastião Inabalável', i: '🏰', c: '#9fb2c6', t: 'A Muralha', d: 'Provocação, defesa colossal e proteção do grupo inteiro.' },
  { id: 'vingador', n: 'Vingador de Ferro', i: '⚖️', c: '#ff7a5a', t: 'O Reflexo', d: 'Devolve o dano recebido: reflexo, contra-ataques e correntes punitivas.' },
  { id: 'guardiao', n: 'Guardião da Vida', i: '💚', c: '#6fe39a', t: 'O Protetor', d: 'Regeneração e resistência: sustenta o grupo e aguenta qualquer batalha.' }],
 pierrot: [
  { id: 'ilusionista', n: 'Ilusionista Sombrio', i: '🎭', c: '#c58bff', t: 'O Enganador', d: 'Ilusões e clones: confunde os inimigos e ataca de todos os lados.' },
  { id: 'cerimonias', n: 'Mestre de Cerimônias', i: '🎪', c: '#ff8fb1', t: 'O Anfitrião', d: 'Comanda o espetáculo: atrações, encantos de plateia e bônus para os aliados.' },
  { id: 'curinga', n: 'Curinga do Destino', i: '🃏', c: '#ffd24a', t: 'O Apostador', d: 'Aposta na sorte: críticos devastadores, mais drops e golpes imprevisíveis.' }]};
const specOf = c => { const l = SPECS[c.cls]; return l && c.spec ? l.find(x => x.id === c.spec) || null : null; };
/** Provação dos Caminhos: abate monstros de Nevasca (Nv ≥ kmin), conclui o Abismo e ajuda a derrotar um chefe de mundo. */
function spEv(c, ev, a) {
  const out = []; if (!c || !c.spq || !c.spq.on || c.spq.ok) return out; const q = c.spq; a = a || {};
  if (ev === 'kill') { if (regOf(a.x) !== -300 || (a.lvl || 0) < SPQ.kmin || q.k >= SPQ.kills) return out; q.k++; }
  else if (ev === 'dg') { if (a.id !== SPQ.dg || q.d) return out; q.d = 1; out.push({ toast: '🌌 Provação: o Abismo foi vencido!', sfx: 'questAccept' }); }
  else if (ev === 'wb') { if (q.w >= SPQ.wb) return out; q.w++; out.push({ toast: '☠️ Provação: chefe de mundo derrotado!', sfx: 'questAccept' }); }
  else return out;
  if (q.k >= SPQ.kills && q.d && q.w >= SPQ.wb) { q.ok = 1; out.push({ toast: '🌟 Provação dos Caminhos concluída!', sfx: 'questDone', log: '<span style="color:#ffe28a">🌟 <b>Provação dos Caminhos concluída!</b> Volte a um Mestre dos Caminhos para escolher o seu.</span>' }); }
  return out;
}

/* ====================== GUILDAS ======================
   Fundação no NPC (10 milhões). Cada guilda tem chat próprio, baú compartilhado e um PRÊMIO COLETIVO semanal: tudo que os
   membros fazem rende Pontos de Guilda (PG); ao atingir cada faixa da semana, quem contribuiu resgata a recompensa (pelo Correio).
   Cargos: 2 = Líder • 1 = Oficial • 0 = Membro. */
const GUILD = { cost: 1e7, nmin: 3, nmax: 16, tmin: 2, tmax: 4, cap: 30, capL: 5, chest: 40, chestL: 6, wkMin: 100, maxLv: 10 };
const GP = { kill: 1, boss: 20, dg: 80, wb: 60, dq: 15, wq: 50 };
const GTIERS = [
  { n: 'Bronze',   i: '🥉', c: '#cd8b4a', per: 600,  rw: 'Ouro, poções e minério de ferro' },
  { n: 'Prata',    i: '🥈', c: '#c8d0d8', per: 1800, rw: 'Mais ouro, essências e 25% de chance de um Pergaminho (Nv 50+)' },
  { n: 'Ouro',     i: '🥇', c: '#ffd24a', per: 4000, rw: 'Equipamento Incomum+ do seu nível, bom ouro e 60% de chance de Pergaminho' },
  { n: 'Lendário', i: '👑', c: '#ff7a4a', per: 8000, rw: 'Equipamento Raro+ do seu nível, muito ouro e um Pergaminho garantido (Nv 50+)' }];
/** nível da guilda pelos PG totais */
const guildLv = exp => Math.min(GUILD.maxLv, 1 + Math.floor(Math.sqrt(Math.max(0, exp) / 4000)));
const guildCap = lv => GUILD.cap + GUILD.capL * (lv - 1), guildChest = lv => GUILD.chest + GUILD.chestL * (lv - 1);
/** PG necessários para cada faixa nesta semana (cresce com o número de membros; mínimo 3) */
const guildNeed = (tier, members) => Math.round(GTIERS[tier].per * Math.max(3, members));
const guildNameOk = n => typeof n === 'string' && /^[A-Za-zÀ-ÿ0-9]+( [A-Za-zÀ-ÿ0-9]+)*$/.test(n) && n.length >= GUILD.nmin && n.length <= GUILD.nmax;
const guildTagOk = t => typeof t === 'string' && /^[A-Za-z0-9]+$/.test(t) && t.length >= GUILD.tmin && t.length <= GUILD.tmax;

/** prêmio do baú (i = 0 Bronze, 1 Prata, 2 Ouro) */
function dwChestLoot(c, w, i) {
  const L = Math.max(1, c.level | 0), CH = (w ? WCH : DCH)[i], items = [], k = w ? 2.5 : 1;
  items.push({ k: 'pot', id: L >= 75 ? 'hp2' : 'hp', n: (i + 1) * (w ? 10 : 5) });
  if (i >= 1) { items.push({ k: 'mat', id: 'ferro', n: Math.round((6 + L * .25) * i * k) }); items.push({ k: 'mat', id: 'essencia', n: Math.max(1, Math.round((1 + L * .08) * i * k)) }); }
  if (i === 2 || (w && i === 1)) items.push(genItem(pick(slotPool(c.cls)), Math.max(1, L + ri(0, 2)), w && i === 2 ? Math.max(2, rarRoll(2)) : rarRoll(w ? 2 : 1), c.cls, c.cls, 0, true));
  if (L >= 50 && Math.random() < (w ? [0, .3, 1][i] : [0, 0, .1][i])) items.push(rollScroll(c.cls, L));       // pergaminho de opção: raro no dia, garantido no baú Ouro da semana
  return { gold: Math.round(dwGold(L) * CH.g / 100) * 100, items };
}
/** prêmio coletivo semanal da guilda (i = 0 Bronze … 3 Lendário) — o servidor entrega pelo Correio */
function guildPrize(c, i) {
  const L = Math.max(1, c.level | 0), items = [], g = [8, 16, 30, 55][i];
  items.push({ k: 'pot', id: L >= 75 ? 'hp2' : 'hp', n: 10 * (i + 1) });
  items.push({ k: 'mat', id: 'ferro', n: Math.round((8 + L * .3) * (i + 1)) });
  if (i >= 1) items.push({ k: 'mat', id: 'essencia', n: Math.max(1, Math.round((1 + L * .06) * i)) });
  if (i >= 2) items.push(genItem(pick(slotPool(c.cls)), Math.max(1, L + ri(0, 3)), i === 3 ? Math.max(2, rarRoll(2)) : Math.max(1, rarRoll(1)), c.cls, c.cls, 0, true));
  if (L >= 50 && Math.random() < [0, .25, .6, 1][i]) items.push(rollScroll(c.cls, L));
  return { gold: Math.round(dwGold(L) * g / 100) * 100, items };
}
const dwSecs = (c, now) => { now = now || Date.now(); return { d: Math.max(0, Math.floor((dayEnd(now) - now) / 1000)), w: Math.max(0, Math.floor((weekEnd(now) - now) / 1000)) }; };

/* ====================== CHEFES DE MUNDO ======================
   Um chefe por região, em horários fixos (horário de Brasília). Todos lutam juntos na arena marcada no mapa:
   a vida do chefe cresce com o poder de quem entra na luta (assim 3 ou 30 jogadores levam um tempo parecido).
   Prêmio por correio, pelo ranking de dano. Chance pequena de uma RELÍQUIA: item Épico com 2 engastes e atributos muito altos. */
const WBOSS = [
  { id: 'wb_a', reg: 0, place: 'Planícies de Aurora (leste)', lv: 34, times: ['12:00', '18:00', '21:00'], life: 20, minLv: 10,
    intro: 'A gosma ancestral acorda no pântano do leste e engole tudo o que encontra.',
    mech: { rain: { n: 3, per: 6, every: 13000, r: 3.2, mult: 2.2, delay: 2200, c: '#7dff8f', name: 'Cuspe Ácido' }, big: { at: [.66, .33], r: 9, mult: 3, delay: 3000, c: '#b6ff4a', name: 'Explosão de Gosma' }, enrage: .2 } },
  { id: 'wb_s', reg: 300, place: 'Solara (extremo oeste do deserto)', lv: 76, times: ['12:30', '18:30', '21:30'], life: 20, minLv: 50,
    intro: 'O Escorpião-Rei emerge das dunas. O chão treme a cada passo.',
    mech: { rain: { n: 3, per: 5, every: 12000, r: 3.4, mult: 2.3, delay: 2200, c: '#ffd45a', name: 'Dardos de Areia' }, big: { at: [.75, .5, .25], r: 11, mult: 3.2, delay: 3000, c: '#ff9a3a', name: 'Terremoto' }, enrage: .2 } },
  { id: 'wb_n', reg: -300, place: 'Nevasca (extremo leste da geleira)', lv: 100, times: ['13:00', '19:00', '22:00'], life: 20, minLv: 75,
    intro: 'Um uivo gelado corta a nevasca. O Wendigo Primordial caça quem ousar subir a geleira.',
    mech: { rain: { n: 4, per: 5, every: 11000, r: 3.4, mult: 2.4, delay: 2200, c: '#9fe0ff', name: 'Estilhaços de Gelo' }, big: { at: [.75, .5, .25], r: 13, mult: 3.4, delay: 3000, c: '#7fd0ff', name: 'Uivo Congelante' }, enrage: .2 } }];
for (const d of WBOSS) { const T = MT[d.id]; d.name = T.n; const z = ZONES.find(q => q.t === d.id); d.x = z.x; d.z = z.z; d.hp = T.hp; }
const BRT_MS = 3 * 3600e3;
const wbHM = t => { const a = t.split(':'); return (+a[0] * 60 + +a[1]) * 60e3; };
/** inícios (ms UTC) dos horários do chefe, de ontem, hoje e amanhã (em ordem) */
const wbSlots = (d, now) => { const k = Math.floor((now - BRT_MS) / 86400e3), o = []; for (let i = -1; i <= 1; i++) for (const t of d.times) o.push((k + i) * 86400e3 + BRT_MS + wbHM(t)); return o.sort((a, b) => a - b); };
/** janela aberta agora (começou e ainda não acabou) → início dela; senão 0 */
const wbCur = (d, now) => { for (const s of wbSlots(d, now)) if (now >= s && now < s + d.life * 60e3) return s; return 0; };
/** próximo horário (início) depois de agora */
const wbNext = (d, now) => { for (const s of wbSlots(d, now)) if (s > now) return s; return 0; };
const wbById = id => WBOSS.find(d => d.id === id);
/** Relíquia de chefe de mundo: Épico com 2 engastes, valores-base bem acima do Épico comum e 4 bônus de atributo (favorecendo o atributo principal). */
function genRelic(cls, ilvl, mo, slot) {
  ilvl = Math.max(1, Math.min(MAX_LEVEL, Math.floor(ilvl)));
  const it = genItem(slot || pick(slotPool(cls).filter(x => x !== 'cape')), ilvl, 3, cls, cls, 2, mo), k = rnd(1.2, 1.32);
  for (const f of ['atk', 'def', 'hp']) if (it[f]) it[f] = Math.round(it[f] * k);
  const main = (CLASSES[cls] || {}).main || 'str', st = ['str', 'agi', 'int', 'vit'], q = Math.max(1, Math.round(ilvl / 3));
  it.bon = {}; it.bon[main] = Math.round(q * 2);
  for (let n = 0; n < 3; n++) { const s2 = n === 0 ? 'vit' : pick(st); it.bon[s2] = (it.bon[s2] || 0) + Math.max(1, q); }
  it.wb = 1; it.name = '✦ ' + it.name.replace(/^★ /, ''); return rollBossAttr(it, cls);
}
/** tabela de cor/nome de raridade (relíquias têm a sua) */
const rarOf = it => it && it.wb ? { n: 'Relíquia', c: '#ffcf4a', m: RAR[3].m } : RAR[it ? it.rar : 0];

/* ---------- criação / migração de personagens ---------- */
/** Barras de habilidade: 16 casas (1–8 e Shift+1–8); cada casa guarda o índice da habilidade (0–7) ou -1. */
const defBar = () => [0, 1, 2, 3, 4, 5, 6, 7, -1, -1, -1, -1, -1, -1, -1, -1];
function cleanBar(b) {
  const o = defBar().fill(-1), seen = new Set();
  if (!Array.isArray(b)) return defBar();
  for (let i = 0; i < 16; i++) { const v = Math.floor(b[i]); if (v >= 0 && v < 9 && !seen.has(v)) { o[i] = v; seen.add(v); } }
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
  c.gm = 1; c.gmu = 0; c.level = MAX_LEVEL; c.xp = 0; c.sp = 0; c.sk = Array(9).fill(MAXRANK);
  const tot = PTS_PER_LEVEL * (MAX_LEVEL - 1), main = Math.round(tot * .6); c.alloc = { str: 0, agi: 0, int: 0, vit: tot - main }; c.alloc[C.main] += main; c.pts = 0;
  c.gold = GM_GOLD;
  const mk = (slot, w) => { const it = genItem(slot, MAX_LEVEL, 3, cls, cls, 0, true); if (slot === 'weapon') it.cls = cls; it.plus = MAXPLUS; return it; };
  c.eq = { weapon: mk('weapon'), helmet: mk('helmet'), armor: mk('armor'), boots: mk('boots'), ring: mk('ring'), ring2: mk('ring'), bracelet: mk('bracelet'), bracelet2: mk('bracelet'), earring: mk('earring'), earring2: mk('earring'), cape: genCape(80, cls) };
  if (cls === 'cavaleiro') c.eq.shield = mk('shield');
  for (const k in c.eq) c.eq[k] = cleanItem(c.eq[k]);
  c.tb = 1; c.title = 'bright';
  c.inv = Array(24).fill(null); c.inv[0] = { k: 'pot', id: 'hp', n: 99 }; c.inv[1] = { k: 'pot', id: 'mp', n: 99 };
  c.bar = defBar(); c.v = R.VERSION;
  if (cls === 'tanque') { c.tkv = 1; c.sk[7] = 0; c.bar = [0, 1, 2, 3, 4, 5, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1]; }
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
  it.ilvl = Math.max(1, Math.min(MAX_LEVEL, Math.floor(it.ilvl))); it.rar = Math.floor(it.rar);
  it.plus = Math.max(0, Math.min(MAXPLUS, Math.floor(it.plus || 0))); it.req = Math.max(1, Math.min(it.ilvl, Math.floor(it.req || it.ilvl - 1)));
  if (it.wb && it.rar === 3 && it.slot !== 'cape') it.wb = 1; else delete it.wb;       // relíquia de chefe de mundo: limites maiores
  const mx = itemMax(it.slot, it.ilvl, it.rar), wk = it.wb ? 1.45 : 1;
  for (const k of ['atk', 'def', 'hp']) { const v = Number(it[k]) || 0; it[k] = Math.max(0, Math.min(Math.round(mx[k] * wk + 1), Math.round(v))); }
  const bmax = Math.max(1, Math.round(it.ilvl / 3)) * Math.max(0, it.rar - 1) * (it.wb ? 3 : 1), nb = {};
  for (const s of ['str', 'agi', 'int', 'vit']) if (it.bon && it.bon[s] > 0) nb[s] = Math.min(bmax, Math.floor(it.bon[s]));
  it.bon = nb;
  { const xa = {}; if (it.xa && typeof it.xa === 'object' && it.slot !== 'cape') for (const k in it.xa) if (xaOk(k, it.xa[k])) xa[k] = it.xa[k]; if (Object.keys(xa).length) it.xa = xa; else delete it.xa; }
  it.sl = Math.max(0, Math.min(MAX_SLOTS, Math.floor(it.sl || 0))); if (!it.sl || it.slot === 'cape') delete it.sl;
  { const cat = gemCat(it), gm = [];   // gemas engastadas: categoria certa (a mesma opção PODE repetir em vários engastes)
    for (let i = 0; i < (it.sl || 0); i++) { const id = Array.isArray(it.gm) ? it.gm[i] : null, g = typeof id === 'string' && GEMD[id]; if (g && g.cat === cat) gm.push(id); else gm.push(null); }
    if (gm.some(Boolean)) it.gm = gm; else delete it.gm; }
  if (!(typeof it.mo === 'string' && OG[it.mo])) delete it.mo;
  if (it.bd) { it.bd = 1; it.exp = EVT.end; } else { delete it.bd; delete it.exp; }   // item de evento: vinculado + validade
  if (typeof it.name !== 'string') it.name = SLOTS[it.slot];
  it.name = it.name.slice(0, 60);
  if (it.slot === 'weapon' && !CLASSES[it.cls]) return null;
  if (it.slot === 'cape') { it.cs = it.cs === 'm' || it.cs === 'a' ? it.cs : 'p'; capeStats(it); }
  return it;
}
/** Atualiza personagens antigos para as regras atuais. Nunca apaga o personagem: só corrige/ajusta. */
function migrate(c) {
  if (!c.sk || !Array.isArray(c.sk)) { c.sk = Array(8).fill(0); c.sk[0] = 1; if (c.sp === undefined) c.sp = c.level; }
  while (c.sk.length < 9) c.sk.push(0); if (c.sp === undefined) c.sp = 0;
  if (c.cls === 'tanque' && !c.tkv) {            // Campo de Atração foi removido: Sentença do Colosso passa de 7 para 6
    c.tkv = 1; const old = c.sk[6] || 0; let rf = 0; for (let r = 0; r < old; r++) rf += skCost(r);
    c.sp = (c.sp || 0) + rf; c.sk[6] = c.sk[7] || 0; c.sk[7] = 0;
    const b0 = Array.isArray(c.bar) ? c.bar : defBar(), isDef = b0.slice(0, 8).every((v, i) => v === i);
    c.bar = isDef ? [0, 1, 2, 3, 4, 5, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1] : b0.map(v => v === 6 ? -1 : v === 7 ? 6 : v);
  }
  c.bar = cleanBar(c.bar);
  c.quests = c.quests || {}; c.inv = Array.isArray(c.inv) ? c.inv : []; while (c.inv.length < 24) c.inv.push(null);
  for (const k of ['dq', 'wq']) { const b = c[k]; if (!(b && typeof b === 'object' && Array.isArray(b.q))) delete c[k]; else { b.k = Math.floor(b.k) || 0; b.pts = Math.max(0, Math.floor(b.pts) || 0); b.ch = [0, 1, 2].map(i => b.ch && b.ch[i] ? 1 : 0);
    b.q = b.q.slice(0, 8).filter(q => q && DWT[q.id]).map(q => ({ id: q.id, n: Math.max(0, Math.floor(q.n) || 0), need: Math.max(1, Math.floor(q.need) || 1), done: q.done ? 1 : 0, got: q.got ? 1 : 0, xp: Math.max(0, Math.floor(q.xp) || 0), gold: Math.max(0, Math.floor(q.gold) || 0), ...(q.reg !== undefined ? { reg: Number(q.reg) || 0 } : {}) })); } }
  c.id = c.id || ('c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)); c.name = typeof c.name === 'string' ? c.name : CLASSES[c.cls].n;   // nome vazio = o jogador ainda vai escolher (não preencher)
  c.kills = Math.max(0, Math.floor(c.kills) || 0);
  { const sl = SPECS[c.cls]; c.spec = typeof c.spec === 'string' && sl && sl.some(x => x.id === c.spec) ? c.spec : ''; if (!c.spec) delete c.spec;
    const q = c.spq; if (q && typeof q === 'object' && q.on) c.spq = { on: 1, k: Math.max(0, Math.min(SPQ.kills, Math.floor(q.k) || 0)), d: q.d ? 1 : 0, w: Math.max(0, Math.min(SPQ.wb, Math.floor(q.w) || 0)), ok: q.ok ? 1 : 0 }; else delete c.spq; }
  { const n0 = v => Math.max(0, Math.min(99999999, Math.floor(v) || 0));
    if (c.dl && typeof c.dl === 'object') c.dl = { w: n0(c.dl.w), l: n0(c.dl.l) }; else delete c.dl;                                          // duelos: vitórias e derrotas
    if (c.pk && typeof c.pk === 'object') c.pk = { k: n0(c.pk.k), d: n0(c.pk.d), p: n0(c.pk.p), bs: n0(c.pk.bs) }; else delete c.pk; }        // Arena PK: abates, mortes, pontos e maior sequência
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
    c.gold = Math.max(0, Math.min(Math.floor(c.gold) || 0, GOLD_MAX));
    c.sk = c.sk.map(r => Math.max(0, Math.min(MAXRANK, Math.floor(r) || 0))); c.sp = Math.max(0, Math.min(c.level + 10, Math.floor(c.sp) || 0));
    for (const k of Object.keys(c.eq || {})) { c.eq[k] = cleanItem(c.eq[k]); if (c.eq[k] && (!validKey(k) || c.eq[k].slot !== keyBase(k))) c.eq[k] = null; }
    c.inv = c.inv.map(cleanItem);
    for (const id in c.quests) if (!QUESTS.some(q => q.id === id)) delete c.quests[id];
    c.v = R.VERSION; c._respec = true;
  }
  if (!c.evt || typeof c.evt !== 'object' || typeof c.evt.got !== 'object') c.evt = { got: {} };
  purgeExp(c);
  return c;
}
function migrateStash(st) { st = Array.isArray(st) ? st : []; st = st.slice(0, 40).map(cleanItem); while (st.length < 40) st.push(null); return st; }


/* ====================== EVENTO: BÔNUS DE BOAS-VINDAS, INAUGURAÇÃO E NATAL ======================
   Até 25/12/2026 23:59:59 (horário de Brasília) o NPC de eventos da Vila Aurora entrega um pacote de presentes a cada 10 níveis (10, 20 ... 100).
   Pacote = conjunto completo +8 do nível, épico, com atributos e 2 engastes com gemas. Vinculado ao personagem, vence no fim do evento. */
const EVT = { end: Date.UTC(2026, 11, 26, 2, 59, 59), lvs: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] };
const evtOn = () => Date.now() <= EVT.end;
function evtPack(cls, L) {
  const C = CLASSES[cls], r = Math.max(1, Math.round(L / 3)), amp = schoolOf(cls) === 'M' ? 'a_ampm' : 'a_ampe';
  const slots = ['weapon', 'armor', 'helmet', 'boots', 'ring', 'ring', 'bracelet', 'bracelet', 'earring', 'earring'].concat(cls === 'cavaleiro' ? ['shield'] : []);
  return slots.map(sl => {
    const it = genItem(sl, L, 3, cls, cls, 2, undefined);
    it.plus = 8; it.bon = C.main === 'vit' ? { vit: r, str: r } : { [C.main]: r, vit: r };
    const g = sl === 'weapon' || sl === 'ring' ? 'w_cdmg' : sl === 'bracelet' ? 'a_lhpl' : sl === 'earring' ? 'a_lhpu' : amp;
    it.sl = 2; it.gm = [g, g]; it.bd = 1; it.exp = EVT.end; it.name = '🎄 ' + it.name;
    return it;
  });
}
/** Fim do evento: os itens vinculados vencem (somem da mochila e do equipamento). Devolve quantos sumiram. */
function purgeExp(c) {
  if (Date.now() <= EVT.end) return 0; let n = 0;
  for (const k in c.eq) if (c.eq[k] && c.eq[k].bd) { c.eq[k] = null; n++; }
  if (Array.isArray(c.inv)) for (let i = 0; i < c.inv.length; i++) if (c.inv[i] && c.inv[i].bd) { c.inv[i] = null; n++; }
  return n;
}
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
/* ---------- QUEBRAR ITEM ---------- */
let _brk = null;
function brkRecipe(it) {   // receita que produz esse tipo de item (slot + nível + raridade; arma ignora classe)
  if (!_brk) { _brk = {}; for (const r of RECIPES) { try { const o = r.out('guerreiro'); if (o && o.k === 'eq') _brk[o.slot + '|' + o.ilvl + '|' + o.rar] = r; } catch (e) {} } }
  return _brk[it.slot + '|' + it.ilvl + '|' + it.rar] || null;
}
const BRK_BR = [{ to: 30, m: ['ferro', 'couro', 'osso'], r: 'essencia' }, { to: 68, m: ['ferrao', 'linho', 'veneno'], r: 'cristalsol' }, { to: 9999, m: ['pelepolar', 'runabar', 'ossogelo'], r: 'fiocristal' }];
/** O que sai ao quebrar: lista [{k:'mat',id,n}] já somada. src: 'receita' | 'estimado' */
function breakReturn(it) {
  const acc = {}, add = (id, n) => { if (n > 0 && MATS[id]) acc[id] = (acc[id] || 0) + n; };
  const rc = brkRecipe(it);
  if (rc) { for (const id in rc.ing) add(id, rc.ing[id]); }
  else {
    const b = BRK_BR.find(x => it.ilvl < x.to), base = (it.ilvl * 5 + 5) * (1 + it.rar * 1.1) * .5 * .38;
    add(b.m[0], Math.max(1, Math.round(base * .6 / MATS[b.m[0]].v)));
    add(b.m[1], Math.max(1, Math.round(base * .4 / MATS[b.m[1]].v)));
    if (it.rar >= 2) add(b.r, it.rar - 1);
    if (it.rar >= 3) add(b.m[2], 1);
  }
  for (const g of (it.gm || [])) if (g && GEMD[g] && MATS['g_' + g]) add('g_' + g, 1);   // gemas engastadas voltam como pergaminho
  let fe = 0, es = 0;
  for (let p = 0; p < (it.plus || 0); p++) { const u = upCost({ plus: p }); fe += u.ferro; es += u.essencia; }
  if (it.plus > 0) { add('ferro', Math.max(1, Math.floor(fe / 2))); add('essencia', Math.floor(es / 2)); }   // 50% do material de aprimoramento
  return Object.keys(acc).map(id => ({ k: 'mat', id, n: Math.min(99, acc[id]) }));
}
function act(sess, m, ctx) {
  const c = sess.c, stash = sess.stash, out = [], spawn = [];
  const T = s => out.push({ toast: s }), L = s => out.push({ log: s }), L2 = L, F = s => out.push({ sfx: s });
  if (c.gm) c.gold = GM_GOLD;   // GM: dinheiro infinito
  const fail = s => { if (s) T(s); if (c.gm) c.gold = GM_GOLD; return { ok: false, out, spawn }; };
  const done = () => { if (c.gm) c.gold = GM_GOLD; chkTitles(c, out); return { ok: true, out, spawn }; };
  const intIn = (v, a, b) => Number.isInteger(v) && v >= a && v < b;
  const colOf = it => it.k === 'eq' ? RAR[it.rar].c : '#fff';
  const npcFor = tab => { const n = npcById(m.npc); if (!n || !n.tabs.includes(tab)) return null; if (ctx && ctx.near && !ctx.near(n)) return null; return n; };
  const t = m && m.t;
  { const pn = purgeExp(c); if (pn) L('<span style="color:#ff9a6a">🎄 O evento terminou: ' + pn + ' item(ns) do evento venceram.</span>'); }
  const DW = ev => { const o = dwEv(c, ev); if (o.length) out.push(...o); };

  if (t === 'break') {
    if (!npcFor('quebrar')) return fail('Procure um ferreiro para quebrar itens.');
    const ii = Array.isArray(m.inv) ? [...new Set(m.inv)].filter(i => intIn(i, 0, c.inv.length)) : [];
    const si = Array.isArray(m.st) ? [...new Set(m.st)].filter(i => intIn(i, 0, stash.length)) : [];
    const inv2 = c.inv.map(x => x && { ...x }), ret = [], rm = [];
    if (ii.some(i => c.inv[i] && c.inv[i].bd)) return fail('🎄 Itens do evento não podem ser quebrados.');
    for (const i of ii) { const it = c.inv[i]; if (it && it.k === 'eq') { rm.push(['i', i]); ret.push(...breakReturn(it)); } }
    for (const i of si) { const it = stash[i]; if (it && it.k === 'eq') { rm.push(['s', i]); ret.push(...breakReturn(it)); } }
    if (!rm.length) return fail('Nenhum equipamento válido selecionado (só mochila e baú).');
    if (rm.length > 300) return fail('Itens demais de uma vez.');
    for (const [w, i] of rm) if (w === 'i') inv2[i] = null;
    const tot = {}; for (const r of ret) tot[r.id] = (tot[r.id] || 0) + r.n;
    for (const id in tot) { let n = tot[id]; while (n > 0) { const q = Math.min(99, n); if (!addItem(inv2, { k: 'mat', id, n: q })) return fail('Mochila cheia: libere espaço para os materiais.'); n -= q; } }
    for (let i = 0; i < c.inv.length; i++) c.inv[i] = inv2[i];
    for (const [w, i] of rm) if (w === 's') stash[i] = null;
    const txt = Object.keys(tot).map(id => `${MATS[id].i} ${MATS[id].n} ×${tot[id]}`).join(', ');
    L(`🔨 Você quebrou <b>${rm.length}</b> item(ns) e recebeu: ${txt}.`); T('Quebrado: ' + rm.length + ' item(ns)'); F('forge');
    return done();
  }
  if (t === 'evclaim') {
    if (!npcFor('evento')) return fail('Chegue perto do NPC de eventos.');
    if (!evtOn()) return fail('O evento terminou.');
    const L = Number(m.lv); if (!EVT.lvs.includes(L)) return fail();
    if (c.level < L) return fail('Você precisa estar no nível ' + L + ' para pegar este pacote.');
    if (!c.evt || typeof c.evt !== 'object' || typeof c.evt.got !== 'object') c.evt = { got: {} };
    if (c.evt.got[L]) return fail('Você já pegou este pacote.');
    const pack = evtPack(c.cls, L), inv2 = c.inv.map(x => x && { ...x });
    for (const it of pack) if (!addItem(inv2, it)) return fail('Mochila cheia: libere pelo menos ' + pack.length + ' espaços para o pacote.');
    for (const it of pack) addItem(c.inv, it);
    c.evt.got[L] = 1; F('upOk'); T('🎁 Pacote do nível ' + L + ' recebido!');
    L2('<span style="color:#ffd27a">🎁 Você recebeu o <b>Pacote de Presente do nível ' + L + '</b> (' + pack.length + ' itens +8 com engastes). Vencem em 25/12/2026 às 23:59.</span>');
    return done();
  }
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
    if (!intIn(m.i, 0, 9)) return fail(); const s = CLASSES[c.cls].skills[m.i]; if (!s) return fail(); const r = c.sk[m.i] || 0; if (r >= MAXRANK) return fail();
    if (c.level < s.lv) return fail('Nível ' + s.lv + ' necessário');
    const cost = skCost(r); if (c.sp < cost) return fail('Pontos de habilidade insuficientes');
    c.sp -= cost; c.sk[m.i] = r + 1; if (!r) { c.bar = cleanBar(c.bar); if (!c.bar.includes(m.i)) { const e = c.bar.indexOf(-1); if (e >= 0) c.bar[e] = m.i; } } F('learn'); T((r ? '⬆️ ' : '📖 ') + s.n + ' — Rank ' + (r + 1));
    L(`<span style="color:#ffe28a">${s.i} ${s.n} ${r ? 'melhorada para' : 'aprendida —'} rank ${r + 1}</span>`); return done();
  }
  if (t === 'pot') {
    const kind = m.kind; if (!POTS[kind]) return fail(); const now = (ctx && ctx.now) || 0;
    if (now && sess.potAt && now < sess.potAt + ((ctx && ctx.potCd) || 2500)) return fail();
    const idx = c.inv.findIndex(s => s && s.k === 'pot' && s.id === kind); if (idx < 0) return fail('Sem ' + POTS[kind].n);
    const s = c.inv[idx]; s.n--; if (s.n <= 0) c.inv[idx] = null; if (now) sess.potAt = now; out.push({ heal: kind }); DW('pot'); return done();
  }
  if (t === 'dropi') {
    if (!intIn(m.i, 0, c.inv.length) || !c.inv[m.i]) return fail(); const it = c.inv[m.i]; if (it.bd) return fail('🎄 Itens do evento são vinculados: não podem ser derrubados.'); c.inv[m.i] = null; spawn.push({ item: it, life: 30000 });
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
    const cost = c.gm ? 0 : sh.c(c); if (c.gold < cost) return fail('Ouro insuficiente');   // GM compra de graça
    const it = sh.mk(c); if (!canAdd(c.inv, it)) return fail('Mochila cheia!'); c.gold -= cost; addItem(c.inv, it); F('coin');
    if (sh.box) { T('Você abriu: ' + nm(it)); L(`🎁 A caixa continha <b style="color:${colOf(it)}">${nm(it)}</b>`); if (it.rar >= 2) F('rare'); } return done();
  }
  if (t === 'buyticket') {
    const n = npcFor('dungeon'); if (!n) return fail('Chegue perto do Guardião das Criptas.');
    const dg = DUNGEONS.find(x => x.id === m.id); if (!dg) return fail();
    if ((dg.reg || 300) !== regOf(n.x)) return fail('Esse ingresso é vendido em ' + REGN[dg.reg || 300] + '.');
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
    L(`🔨 Você forjou <b style="color:${colOf(o)}">${nm(o)}</b>`); DW('craft'); return done();
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
    DW('enh'); return done();
  }
  if (t === 'dep' || t === 'wd') {
    if (!npcFor('bau')) return fail('Chegue perto do Baú.');
    if (t === 'dep') { if (!intIn(m.i, 0, c.inv.length)) return fail(); const it = c.inv[m.i]; if (!it) return fail(); if (it.bd) return fail('🎄 Itens do evento são vinculados: não podem ir para o baú.'); if (!canAdd(stash, it)) return fail('Baú cheio!'); c.inv[m.i] = null; if (!addItem(stash, it)) { c.inv[m.i] = it; return fail('Baú cheio!'); } return done(); }
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
  if (t === 'socket' || t === 'extend') {
    if (!npcFor('engastar')) return fail('Chegue perto de um Gemólogo.');
    const ref = String(m.ref || ''); let it = null;
    if (ref.startsWith('eq:')) it = validKey(ref.slice(3)) && c.eq[ref.slice(3)]; else if (ref.startsWith('inv:')) { const i = +ref.slice(4); it = intIn(i, 0, c.inv.length) ? c.inv[i] : null; }
    if (!it || it.k !== 'eq') return fail('Escolha um equipamento.');
    if (it.slot === 'cape') return fail('Capas não têm engastes.');
    if (t === 'extend') {
      if ((it.sl || 0) >= MAX_SLOTS) return fail('Este item já tem o máximo de ' + MAX_SLOTS + ' engastes.');
      const ei = c.inv.findIndex(s => s && s.k === 'mat' && s.id === 'g_ext'); if (ei < 0) return fail('Você precisa de um Extensor de Slot (60.000.000).');
      c.inv[ei].n--; if (c.inv[ei].n <= 0) c.inv[ei] = null;
      it.sl = (it.sl || 0) + 1; it.gm = Array.isArray(it.gm) ? it.gm.slice(0, it.sl - 1) : []; while (it.gm.length < it.sl) it.gm.push(null); if (!it.gm.some(Boolean)) delete it.gm;
      F('upOk'); T('🔳 Novo engaste! ' + nm(it)); L(`<span style="color:#c9a8ff">🔳 ${it.name} ganhou um engaste: agora tem <b>${it.sl}</b>.</span>`); return done();
    }
    const si = m.si; if (!intIn(si, 0, it.sl || 0)) return fail('Escolha um engaste.');
    const gi = m.gi; if (!intIn(gi, 0, c.inv.length)) return fail(); const sc = c.inv[gi];
    if (!sc || sc.k !== 'mat' || !MATS[sc.id] || !MATS[sc.id].gem) return fail('Escolha um pergaminho de opção.');
    const g = GEMD[MATS[sc.id].gem], cat = gemCat(it);
    if (g.cat !== cat) return fail(cat === 'w' ? 'Esta gema é de ARMADURA: não serve em armas nem em anéis.' : 'Esta gema é de ARMA: só serve em armas e anéis.');
    const gm = Array.isArray(it.gm) ? it.gm.slice(0, it.sl) : []; while (gm.length < it.sl) gm.push(null);
    if (gm[si] === g.id) return fail('Este engaste já tem essa mesma gema.');
    if (it.bd && gm[si]) return fail('🎄 As gemas dos itens do evento não podem ser trocadas.');
    if (gm[si] && !m.rep) return fail('O engaste já está ocupado: confirme para substituir (a gema antiga é destruída).');
    sc.n--; if (sc.n <= 0) c.inv[gi] = null; gm[si] = g.id; it.gm = gm;
    F('upOk'); T('💎 Gema engastada: ' + g.o); L(`<span style="color:${GRADES[g.g].c}">💎 ${g.n} engastada em ${it.name}: <b>${g.o} ${gemTxt(g, it.ilvl)}</b></span>`); DW('sock'); return done();
  }
  if (t === 'unsocket') {                                                  // SÓ GM: retira gemas engastadas quando quiser (volta o pergaminho)
    if (!c.gm) return fail('Só contas GM podem retirar gemas.');
    if (!npcFor('engastar')) return fail('Chegue perto de um Gemólogo.');
    const ref = String(m.ref || ''); let it = null;
    if (ref.startsWith('eq:')) it = validKey(ref.slice(3)) && c.eq[ref.slice(3)]; else if (ref.startsWith('inv:')) { const i = +ref.slice(4); it = intIn(i, 0, c.inv.length) ? c.inv[i] : null; }
    if (!it || it.k !== 'eq' || !Array.isArray(it.gm)) return fail('Esse equipamento não tem gemas.');
    const idx = m.all ? it.gm.map((_, i) => i) : (intIn(m.si, 0, it.gm.length) ? [m.si] : []);
    const ids = idx.filter(i => it.gm[i]).map(i => it.gm[i]); if (!ids.length) return fail('Nenhuma gema nesse engaste.');
    const inv2 = c.inv.map(x => x && { ...x });
    for (const id of ids) if (!addItem(inv2, { k: 'mat', id: 'g_' + id, n: 1 })) return fail('Mochila cheia!');
    for (const id of ids) addItem(c.inv, { k: 'mat', id: 'g_' + id, n: 1 });
    for (const i of idx) it.gm[i] = null; if (!it.gm.some(Boolean)) delete it.gm;
    F('upOk'); T('💎 Gema(s) retirada(s): ' + ids.length); L(`<span style="color:#7fe0ff">💎 GM: ${ids.length} gema(s) retirada(s) de ${it.name} (voltaram como pergaminho).</span>`); return done();
  }
  if (t === 'sp_start' || t === 'sp_pick' || t === 'sp_reset') {            // Mestre dos Caminhos (nível 100)
    if (!npcFor('caminhos')) return fail('Chegue perto do Mestre dos Caminhos.');
    if (c.level < SPEC_LV && !c.gm) return fail('Os Caminhos abrem no nível ' + SPEC_LV + '.');   // GM: qualquer nível
    if (t === 'sp_start') {
      if (c.spq || c.spec) return fail();
      c.spq = { on: 1, k: 0, d: 0, w: 0, ok: 0 }; F('questAccept'); T('📜 Provação dos Caminhos aceita!');
      L(`<span style="color:#c9a8ff">📜 <b>Provação dos Caminhos</b>: derrote ${SPQ.kills} monstros de Nevasca (Nv ${SPQ.kmin}+), conclua o ${(DUNGEONS.find(d => d.id === SPQ.dg) || {}).name || SPQ.dg} e ajude a derrotar ${SPQ.wb} Chefe de Mundo.</span>`); return done();
    }
    if (t === 'sp_pick') {
      const sp = (SPECS[c.cls] || []).find(x => x.id === m.id); if (!sp) return fail();
      // GM: escolhe (ou troca) o Caminho a qualquer hora, sem Provação e sem custo
      if (!c.gm) {
        if (c.spec) return fail('Você já trilha um Caminho. Use a Reconsagração para trocar.');
        if (!(c.spq && c.spq.ok)) return fail('Conclua a Provação dos Caminhos primeiro.');
        if (c.gold < SPEC_COST) return fail('São necessários ' + fmtN(SPEC_COST) + ' 💰.');
        c.gold -= SPEC_COST;
      } else if (c.spec === sp.id) return fail('Você já trilha esse Caminho.');
      else if (c.title && /^sp:/.test(c.title)) c.title = '';
      c.spec = sp.id; F('levelUp'); T(sp.i + ' Caminho escolhido: ' + sp.n + '!');
      L(`<span style="color:${sp.c}">${sp.i} Você trilha o Caminho <b>${sp.n}</b> — título <b>${sp.t}</b> liberado. (Os estilos de luta de cada Caminho chegam em breve.)</span>`); return done();
    }
    if (!c.spec) return fail('Você ainda não escolheu um Caminho.');
    if (!c.gm && c.gold < SPEC_RESET) return fail('São necessários ' + fmtN(SPEC_RESET) + ' 💰.');
    c.gold -= SPEC_RESET; const was = specOf(c); delete c.spec; if (c.title && /^sp:/.test(c.title)) c.title = '';
    T('Caminho reconsagrado.'); L(`<span style="color:#c9a8ff">🔄 Você deixou o Caminho ${was ? was.n : ''}. Escolha outro com o Mestre dos Caminhos.</span>`); return done();
  }
  if (t === 'dwsync') { dwSync(c); return done(); }
  if (t === 'dwclaim' || t === 'dwchest') {
    dwSync(c); const w = m.w ? 1 : 0, box = w ? c.wq : c.dq, i = m.i, give = it => { if (!addItem(c.inv, it)) spawn.push({ item: it, life: 0 }); };
    if (t === 'dwclaim') {
      const q = Number.isInteger(i) && box.q[i]; if (!q || !q.done || q.got) return fail();
      q.got = 1; c.gold = Math.min(GOLD_MAX, c.gold + q.gold); F('questDone'); T(`Recompensa recebida: ${fmtN(q.gold)} 💰 + ${fmtN(q.xp)} XP`);
      L(`<span style="color:#6fdc7f">${w ? '🗓️' : '📅'} "${DWT[q.id].t}" — recompensa: <b>${fmtN(q.gold)}</b> 💰 e <b>${fmtN(q.xp)}</b> XP.</span>`);
      if (gainXp(c, q.xp)) out.push({ lvl: c.level }); return done();
    }
    const CH = (w ? WCH : DCH)[i]; if (!CH || box.ch[i]) return fail();
    if ((w ? box.pts : box.q.filter(x => x.done).length) < CH.need) return fail('Ainda não alcançou os pontos deste baú.');
    box.ch[i] = 1; const loot = dwChestLoot(c, w, i); c.gold = Math.min(GOLD_MAX, c.gold + loot.gold); for (const it of loot.items) give(it);
    F('rare'); T(`🎁 Baú ${CH.n} aberto!`); L(`<span style="color:#ffd27a">🎁 Baú ${w ? 'da semana' : 'do dia'} <b>${CH.n}</b>: <b>${fmtN(loot.gold)}</b> 💰${loot.items.map(it => ' • ' + nm(it) + (it.n > 1 ? ' ×' + it.n : '')).join('')}</span>`);
    return done();
  }
  if (t === 'died') {
    const loss = Math.floor(xpNeed(c.level) * .05); c.xp = Math.max(0, c.xp - loss);
    L(`<span style="color:#ff6b6b">Você morreu e perdeu ${loss} XP.</span>`); return done();
  }
  return fail();
}

/* ====================== PvP: DUELOS E ARENA PK ======================
   Dano entre jogadores = a MESMA fórmula das habilidades (hitDamage), só que com defesa suavizada e um fator por nível do
   atacante e por classe — calibrado por simulação para que lutas entre jogadores de nível/equipamento parecidos durem algo
   como 30 a 60 s em qualquer faixa de nível. Valores em um só lugar, fáceis de ajustar. */
const PVP = {
  def: .3,                                                   // só 30% da defesa do alvo entra na conta contra jogadores
  kL: [[1, .09], [10, .098], [20, .12], [30, .135], [40, .17], [50, .19], [60, .22], [70, .255], [80, .32], [90, .375], [100, .39]],   // fator por nível do atacante
  cm: { guerreiro: 1, arqueiro: .26, mago: .32, assassino: .47, cavaleiro: .93, tanque: 2.15, pierrot: .21 },                       // fator por classe (equilibra o dano total)
  potCd: 15000, potK: .5,                                    // poções em duelo/arena: recarga de 15 s e metade do efeito
  cc: { stun: 1000, root: 1500, slow: 2500, imm: 3000 },     // atordoar/prender/lentidão em jogadores (máx. em ms) e imunidade depois de um controle
  slack: 1.3                                                 // folga do verificador de vida do servidor (nunca pune um jogador honesto)
};
const pvpK = (cls, lv) => {
  const a = PVP.kL, L = Math.max(1, Math.min(MAX_LEVEL, Math.floor(lv) || 1)); let k = a[a.length - 1][1];
  for (let i = 1; i < a.length; i++) if (L <= a[i][0]) { const f = (L - a[i - 1][0]) / (a[i][0] - a[i - 1][0]); k = a[i - 1][1] + (a[i][1] - a[i - 1][1]) * f; break; }
  return k * (PVP.cm[cls] || 1);
};
const DUEL = { ask: 20000, count: 5000, limit: 300000, r: 32, maxDist: 45, out: 6000, spam: 1500, decl: 20000 };   // pedido vale 20 s • contagem 5 s • luta até 5 min • área de 32 m • 45 m para pedir • 6 s fora da área = derrota
const ARENA = { x: 1800, z: 0, r: 36, minLv: 20, prot: 5000, resp: 5000, leave: 8000, spawnR: 27, exit: { x: 1800, z: -31 },
  pts: { kill: 10, streak: 2, cap: 10, same: 3, sameMs: 600000 },    // 10 pts por abate + 2 por abate seguido (até 10) • no máximo 3 abates da mesma vítima a cada 10 min
  minPts: 50, prize: [6e6, 3e6, 1.5e6] };                            // prêmio semanal do ranking (ouro, por correio) — mínimo de 50 pontos
const arenaIn = x => x > 1650;
const arenaPrize = (c, i) => {
  const L = Math.max(1, c.level | 0), items = [{ k: 'pot', id: L >= 75 ? 'hp2' : 'hp', n: 10 * (3 - i) }];
  if (i === 0 && L >= 50) items.push(rollScroll(c.cls, L));
  return { gold: ARENA.prize[i] || 0, items };
};

const ANIM = { shield: 300, jump: 800, beam: 750, throw: 450, spin: 700, stomp: 600, sumo: 1100, stab: 600, sky: 700, charge: 700, blast: 420 };
/* cores dos conjuntos: cada conjunto (origem) fica com uma cor própria e bem diferente das outras, para dar para reconhecer a peça pelo visual.
   A cor original é mantida quando já é única; quando parece com a de um conjunto anterior, o matiz é girado até ficar distinta. colO/col2O guardam as originais. */
(() => {
  const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; };
  const hex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const hsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; let h = 0, s = 0;
    if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; };
  const unhsl = (h, s, l) => { const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(h / 60 % 2 - 1)), m = l - c / 2, i = Math.floor(h / 60) % 6;
    const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][i]; return [(r + m) * 255, (g + m) * 255, (b + m) * 255]; };
  const dist = (a, b) => { const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2], rm = (a[0] + b[0]) / 2; return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db); };
  const used = [], bySf = {}, seen = new Set(), LS = [.5, .66, .38, .58, .76, .44], SS = [.72, .55, .9];
  for (const k in OG) { const g = OG[k]; if (seen.has(g)) continue; seen.add(g);
    if (bySf[g.sf]) { g.colO = g.col; g.col2O = g.col2; g.col = bySf[g.sf][0]; g.col2 = bySf[g.sf][1]; continue; }
    let c = rgb(g.col), n = 0; const near = v => used.reduce((m, u) => Math.min(m, dist(u, v)), 1e9);
    if (near(c) < 110) { n = 1; let best = -1;      // parecida com um conjunto anterior: escolhe, entre matizes/tons possíveis, a cor mais distante de todas as já usadas
      for (let h = 0; h < 360; h += 10) for (const l of LS) for (const sv of SS) { const v = unhsl(h, sv, l), d = near(v); if (d > best) { best = d; c = v; } } }
    used.push(c);
    if (n) { g.colO = g.col; g.col2O = g.col2; g.col = hex(c); const [h, s2, l] = hsl(c); g.col2 = hex(unhsl(h, Math.min(1, s2 + .05), Math.max(.14, l * .48))); }
    bySf[g.sf] = [g.col, g.col2]; }
})();
/* tempo de exibição de cada habilidade (ms): enquanto ele não acaba, outra habilidade não pode ser lançada.
   x = { dist: distância até o alvo, n: nº de alvos (saltos), hits } — o servidor chama sem x (usa o mínimo), o cliente passa os valores reais */
const castMs = (cls, i, x) => {
  const C = CLASSES[cls], s = C && C.skills[i]; if (!s) return 260; x = x || {};
  const a = ANIM[s.anim] || 0, hits = x.hits || s.hits || 1, fly = (x.dist || 0) / 24 * 1000, pr = s.proj || (C.ranged ? C.proj : null); let t;
  switch (s.type) {
    case 'single': t = pr === 'hook' ? 950 : s.charge ? (s.pre || 300) + fly + 250 : pr ? 250 + fly : 400; break;
    case 'multi': t = s.fan ? 580 + fly : (hits - 1) * 190 + 300 + (pr ? fly : 0); break;
    case 'stab3': t = 650; break;
    case 'aoeSelf': t = s.delay ? s.delay + 350 : 450; break;
    case 'aoeMulti': t = 200 + hits * 200 + 150; break;
    case 'aoeTarget': t = s.balls ? (s.balls - 1) * (s.gap || 420) + 850 : s.meteor ? 850 : 900; break;
    case 'barrage': t = 200 + hits * 130 + 200; break;
    case 'dash': t = 450; break;
    case 'dashBack': t = s.blast ? 520 : 400; break;
    case 'shieldThrow': t = 300 + 2 * ((s.range || 10) / (s.fspd || 16) * 1000) + (s.spin || 2) * 1000; break;   // ida + giro + volta
    case 'shieldBeam': t = 250 + (s.beam || 3) * 1000; break;                          // raio canalizado
    case 'daggerFan': t = 450; break;
    case 'starJump': t = 100 + (Math.max(1, x.n || 1) - 1) * 520 + 500; break;
    case 'chainPull': t = s.gust ? 900 : 700; break;
    case 'thunder': t = 1000; break;
    case 'arcRay': t = 650; break;
    case 'roll': t = 600; break;
    default: t = 500;                                                                 // buff, cura, provocar, clones, metamorfose, manto, marca
  }
  return Math.round(Math.max(a, t));
};
const animMs = (cls, i) => { const s = CLASSES[cls] && CLASSES[cls].skills[i]; return (s && ANIM[s.anim]) || 260; };
Object.assign(R, { EVT, evtOn, evtPack, purgeExp, PVP, pvpK, DUEL, ARENA, arenaIn, arenaPrize, weekEnd, guildPrize, SPEC_LV, SPEC_COST, SPEC_RESET, SPQ, SPECS, specOf, spEv, GUILD, GP, GTIERS, guildLv, guildCap, guildChest, guildNeed, guildNameOk, guildTagOk, dgGrid, dgCell, dgWalk, dgRoomAt, dgPorts, DGCS, WBOSS, wbSlots, wbCur, wbNext, wbById, genRelic, rarOf, DWT, DCH, WCH, REGN, dayKey, weekKey, dwSync, dwEv, dwChestLoot, dwSecs, dwGold, regOf, hkeyOf, GRADES, GEMS, GEMD, GCAP, GCAPL, EXT_PRICE, MAX_SLOTS, gemVal, gemTxt, gemCat, schoolOf, gemTotals, rollScroll, OGK, SETB, BLAB, setBonus, setCounts, setInfo, setTf, GOLD_MAX, animMs, castMs, tierOf, TIERC, TIERC2, ANIM, GM_GOLD, gmChar, titleList, titleInfo, titleHave, dgDone, brightProg, MAXPLUS, TCOL, genCape, isMag, capeKind, CAPEWHO, CPN, CMN, defBar, cleanBar, skCost, luckOf, canSkillUp, OG, keyBase, validKey, eqKey, apOf, originFor, BRN, ERN, DUNGEONS, dgChestLoot, xpNeed, PTS_PER_LEVEL, MAX_LEVEL, GOLD_CAP_PER_LEVEL, XN, RAR, SLOTS, STN, WN, AN, HN, BN, RN, SHN, SUF, MATS, POTS, MAXRANK, CLASSES, MT, ZONES, QUESTS, QNAME, RECIPES, NPCS,
  SHOPS, eff, nm, sellPrice, breakReturn, rollBossAttr, XA, xaName, defRoll, flatRed, leech, CRIT_CAP, upRate, upCost, slotPool, rarRoll, genItem, canAdd, addItem, have, take, stats, skStat, hitDamage, xpFor, rollLoot, gainXp, questKill, newChar, cleanItem, migrate, migrateStash, act, npcById });
root.RULES = R;
if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
