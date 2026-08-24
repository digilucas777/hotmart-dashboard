-- Migration 061: checkpoints/backup de tabelas de configuração
--
-- Motivado por um incidente real (2026-08-24): salvar a lista de produtos de
-- um dashboard (RECUPERAÇÃO GERAL) reescreveu a tabela inteira de uma vez
-- (delete + insert) e perdeu configuração de ofertas específicas de 11
-- produtos que já estavam corretos — sem log, sem histórico, sem jeito de
-- saber o que era antes. Essa tabela guarda "fotos" (snapshots) das tabelas
-- de configuração mais arriscadas de editar, pra dar um jeito de reverter
-- rapidamente qualquer edição que dê errado (do admin, ou de qualquer outra
-- pessoa com acesso).
create table if not exists config_snapshots (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  scope_id uuid,
  payload jsonb not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists config_snapshots_lookup_idx
  on config_snapshots (table_name, scope_id, created_at desc);

alter table config_snapshots enable row level security;

-- Só admin lê/gerencia snapshots (mesmo padrão de is_admin() já usado em
-- outras tabelas admin-only, ver migration 041). Escritas de rotina (cron,
-- salvar produtos) usam a service role, que não passa por RLS.
create policy "admin gerencia snapshots" on config_snapshots
  for all using (public.is_admin());
