# Projeto MMORPG — servidor (login + PostgreSQL + multiplayer)

Um único serviço Node serve o jogo (`public/index.html`), a API de contas (`/api`) e o multiplayer (WebSocket, Colyseus).
Quem joga só precisa do link.

> **Estrutura plana:** todos os arquivos ficam na mesma pasta (sem `src/` nem `public/`), para facilitar o envio pelo site do GitHub. O jogo é o `index.html`.

## Rodar no seu computador

**Com Docker (mais simples):**
```
docker compose up --build
```
Abra http://localhost:3000, crie uma conta e jogue. Abra uma segunda aba anônima, crie outra conta e veja os dois jogadores.

**Sem Docker:** instale Node 20+ e PostgreSQL, crie um banco e rode:
```
cp env.example .env     # ajuste DATABASE_URL e JWT_SECRET
npm install
export $(grep -v '^#' .env | xargs)
npm start
```
Teste automático (com o servidor rodando): `npm run smoke`.

## Publicar online (sem deixar o PC ligado)

1. Crie um repositório no GitHub e envie esta pasta:
   ```
   git init && git add . && git commit -m "MMORPG 0.7"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
   git push -u origin main
   ```
2. Em uma hospedagem (Render, Railway ou Fly.io):
   - crie um **PostgreSQL** gerenciado e copie a URL de conexão;
   - crie um **Web Service** a partir do repositório (Node, ou use o `Dockerfile`);
   - comando de build: `npm install` — comando de start: `npm start`;
   - variáveis de ambiente: `DATABASE_URL` (URL do banco), `JWT_SECRET` (texto longo e aleatório), `NODE_ENV=production`; se o banco exigir SSL, `PGSSL=true`.
3. O link público do serviço é o endereço do jogo. A porta vem da variável `PORT`, que a hospedagem define.

Planos gratuitos costumam "dormir" sem acessos; para um mundo persistente, prefira um plano pago pequeno. Confira os planos atuais no site do provedor.

## Música e efeitos sonoros

- **Música:** o jogo toca o arquivo `tema.mp3` (na mesma pasta do `index.html`, em loop). Basta colocar o arquivo no repositório com **exatamente esse nome** e fazer o deploy. Sem o arquivo, o jogo toca uma trilha ambiente provisória gerada no navegador, e o painel de áudio avisa.
  - Use uma faixa da qual você tenha **licença/permissão** para usar em um jogo público. Arquivos de até 25 MB sobem pelo site do GitHub.
  - Dica: um MP3 em ~128–192 kbps carrega rápido e soa bem.
- **Controles:** botão 🔊 no menu do jogo (ou no canto da tela de login) abre o painel com **volume e mudo** separados para música e efeitos. A tecla **M** liga/desliga a música. As escolhas ficam salvas no navegador.
- **Efeitos:** são sintetizados em tempo real pelo navegador (Web Audio), sem arquivos extras. Cada espécie de monstro tem a própria voz (som ambiente, ao te notar, ao atacar, ao apanhar e ao morrer; o Golem e o Dragão têm também um golpe especial sonoro), e cada skill das 5 classes tem um som próprio. Os sons dos monstros ficam mais baixos com a distância e vêm do lado certo da tela.
- Os navegadores só liberam áudio depois do primeiro clique/tecla do jogador; por isso a música começa depois do primeiro clique na tela de login.

## O que está implementado (fases 1 e 2)

- Cadastro e login (senha com bcrypt, sessão JWT de 30 dias, limite de tentativas por IP).
- Personagens e baú salvos no PostgreSQL; importação opcional do save local do navegador.
- Sala `world`: jogadores visíveis e sincronizados, chat global e privado (`/w nome mensagem`), uma sessão por conta, reconexão automática.
- Servidor limita a velocidade de movimento e os limites do mapa (anti-teleporte).
- Abrindo `index.html` direto do disco, o jogo continua funcionando offline (modo antigo, com `localStorage`).

## Limitações conhecidas (próximas fases)

- **Level, ouro, itens e XP ainda são calculados no navegador** e o servidor só valida o formato dos dados. Um jogador técnico ainda consegue alterá-los. Isso só se resolve na fase 3 (monstros, combate, drops e XP no servidor).
- Monstros ainda são locais: cada jogador vê os próprios.
- Obstáculos (rio, árvores) ainda não são verificados no servidor.
- Dois navegadores abertos na mesma conta: o último a salvar vence (o servidor derruba a sessão anterior ao entrar de novo).
