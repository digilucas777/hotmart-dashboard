-- Pastas de dashboards (organização manual do admin, sem relação com permissão
-- de acesso) — ver docs/superpowers/specs/2026-09-11-pastas-de-dashboards-design.md
-- e docs/superpowers/plans/2026-09-11-pastas-de-dashboards.md.
--
-- Aplicada originalmente via apply_migration (MCP) em 2026-09-11 — este arquivo
-- documenta o schema já em produção, mesmo padrão das migrações 001-071.
create table if not exists dashboard_folders (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists dashboard_folder_projetos (
  folder_id uuid not null references dashboard_folders(id) on delete cascade,
  projeto_id uuid not null references projetos(id) on delete cascade,
  primary key (folder_id, projeto_id)
);

alter table dashboard_folders enable row level security;
alter table dashboard_folder_projetos enable row level security;

create policy "admin gerencia dashboard_folders" on dashboard_folders
for all using (is_admin()) with check (is_admin());

create policy "admin gerencia dashboard_folder_projetos" on dashboard_folder_projetos
for all using (is_admin()) with check (is_admin());
