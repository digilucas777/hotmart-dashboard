-- vendas_resumo_diario_backup_20260908 foi criada como rede de segurança antes do
-- TRUNCATE+re-backfill da migração 068 (correção do bug de fuso horário) — nunca usada
-- em nenhuma consulta da aplicação. Encontrada pelo Supabase advisor durante a revisão
-- final da feature de pastas de dashboards (2026-09-11): RLS estava desabilitada,
-- deixando ~12 mil linhas de faturamento real legíveis/graváveis por qualquer um com a
-- chave anon (pública, já embutida no client desta aplicação).
alter table vendas_resumo_diario_backup_20260908 enable row level security;

create policy "só admin lê o backup" on vendas_resumo_diario_backup_20260908
for select using (is_admin());
