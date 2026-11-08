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
}
