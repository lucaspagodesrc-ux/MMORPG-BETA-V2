import { Pool, types } from "pg";

// bigint (ouro, preços de milhões) vem do banco como número, não como texto.
types.setTypeParser(20, (v: string) => Number(v));

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
});

// Migração idempotente: roda a cada start do servidor.
export async function migrate() {
  await pool.query(`
    create table if not exists accounts(
      id serial primary key,
      username text not null,
      pass_hash text not null,
      stash jsonb not null default '[]',
      created_at timestamptz not null default now());
    create unique index if not exists accounts_username_lower on accounts(lower(username));
    create table if not exists characters(
      id text primary key,
      account_id int not null references accounts(id) on delete cascade,
      name text not null,
      class text not null,
      level int not null default 1,
      data jsonb not null,
      updated_at timestamptz not null default now());
    create index if not exists characters_account on characters(account_id);
    alter table accounts add column if not exists ah_gold bigint not null default 0;
    create table if not exists auction(
      id serial primary key,
      account_id int not null references accounts(id) on delete cascade,
      seller text not null,
      ikey text not null,
      item jsonb not null,
      qty int not null check (qty > 0),
      price int not null check (price > 0),
      created_at timestamptz not null default now());
    create index if not exists auction_account on auction(account_id);
    create index if not exists auction_price on auction(price);
    create table if not exists mail(
      id serial primary key,
      account_id int not null references accounts(id) on delete cascade,
      kind text not null default 'sys',
      title text not null,
      body text not null default '',
      gold bigint not null default 0,
      items jsonb not null default '[]',
      read boolean not null default false,
      created_at timestamptz not null default now());
    create index if not exists mail_account on mail(account_id, id desc);
  `);
  // v1.36: pergaminhos custam milhões, então o preço do leilão vira bigint; e cada venda entra no histórico de preços (por modelo de item).
  try { await pool.query("alter table auction alter column price type bigint"); } catch (e) { console.error("[leilão] price→bigint falhou", e); }
  try {
    await pool.query(`
      create table if not exists auction_sales(
        id serial primary key,
        hkey text not null,
        price bigint not null,
        qty int not null default 1,
        sold_at timestamptz not null default now());
      create index if not exists auction_sales_key on auction_sales(hkey, id desc);`);
  } catch (e) { console.error("[leilão] tabela de histórico falhou", e); }
  try {
    await pool.query(`alter table auction add column if not exists hkey text; create index if not exists auction_hkey on auction(hkey);`);
    const R: any = require("./rules.js");
    const rows = (await pool.query("select id,item from auction where hkey is null limit 5000")).rows;
    for (const r of rows) await pool.query("update auction set hkey=$2 where id=$1", [r.id, R.hkeyOf(r.item)]);
  } catch (e) { console.error("[leilão] coluna hkey falhou", e); }
  // v1.37: chefes de mundo — guarda o último horário já atendido de cada chefe (reiniciar o servidor não faz o chefe nascer de novo)
  try { await pool.query(`create table if not exists wb_state(id text primary key, slot bigint not null default 0, kills int not null default 0, updated_at timestamptz not null default now())`); }
  catch (e) { console.error("[chefes] tabela falhou", e); }
  // v1.37: guildas (chat, baú compartilhado, cofre de ouro, prêmio coletivo semanal)
  try {
    await pool.query(`
      create table if not exists guilds(
        id serial primary key,
        name text not null,
        tag text not null,
        notice text not null default '',
        exp bigint not null default 0,
        gold bigint not null default 0,
        chest jsonb not null default '[]',
        wk int not null default 0,
        wpts bigint not null default 0,
        log jsonb not null default '[]',
        created_at timestamptz not null default now());
      create unique index if not exists guilds_name_lower on guilds(lower(name));
      create unique index if not exists guilds_tag_lower on guilds(lower(tag));
      create table if not exists guild_members(
        char_id text primary key,
        guild_id int not null references guilds(id) on delete cascade,
        account_id int not null,
        name text not null,
        cls text not null,
        level int not null default 1,
        role int not null default 0,
        wpts bigint not null default 0,
        tpts bigint not null default 0,
        claimed int not null default 0,
        seen bigint not null default 0,
        joined_at timestamptz not null default now());
      create index if not exists guild_members_guild on guild_members(guild_id);`);
  } catch (e) { console.error("[guildas] tabelas falharam", e); }
  // v1.38: Arena PK — ranking semanal (pontos, abates e mortes por personagem; o prêmio do top 3 é resgatado uma vez por semana)
  try {
    await pool.query(`
      create table if not exists arena_rank(
        wk int not null,
        cid text not null,
        name text not null,
        cls text not null default '',
        level int not null default 1,
        pts int not null default 0,
        k int not null default 0,
        d int not null default 0,
        claimed boolean not null default false,
        primary key (wk, cid));
      create index if not exists arena_rank_pts on arena_rank(wk, pts desc);`);
  } catch (e) { console.error("[arena] tabela falhou", e); }
  // v1.34: ganhos antigos do leilão (accounts.ah_gold) viram uma carta no correio.
  try {
    await pool.query(`with o as (update accounts set ah_gold=0 where ah_gold>0 returning id, ah_gold)
      insert into mail(account_id,kind,title,body,gold) select id,'ah','💰 Ganhos do Leilão','Ganhos de vendas feitas antes do Correio.',ah_gold from o`);
  } catch (e) { console.error("[correio] migração de ganhos falhou", e); }
  // Nomes padrão ("Mago 1", "Assassino 2"...) viram vazios: o jogador escolhe o nome na primeira entrada. Nenhum personagem é apagado.
  // Só mexe em quem ainda não escolheu nome (data.nmOk ausente); nomes já escolhidos ficam como estão.
  try {
    const r = await pool.query(`
      update characters set name='', data=jsonb_set(data,'{name}','""'::jsonb)
      where coalesce(data->>'nmOk','')='' and coalesce((data->>'gm')::int,0)=0
        and name ~ '^(Guerreiro|Arqueiro|Mago|Assassino|Cavaleiro|Cavaleiro Pesado|Tanque|Pierrot) [0-9]+$'`);
    if (r.rowCount) console.log(`[nomes] ${r.rowCount} personagem(ns) com nome padrão aguardam novo nome.`);
  } catch (e) { console.error("[nomes] migração de nomes padrão falhou", e); }
  // Unicidade (sem diferenciar maiúsculas). Se já existirem nomes repetidos no banco, o índice não é criado e a checagem fica só no código.
  try { await pool.query(`create unique index if not exists characters_name_lower on characters(lower(name)) where name <> ''`); }
  catch (e) { console.warn("[nomes] índice único não criado (há nomes repetidos antigos); a checagem continua no código."); }
}
