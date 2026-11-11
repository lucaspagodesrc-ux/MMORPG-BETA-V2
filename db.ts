import { Pool } from "pg";

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
  `);
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
