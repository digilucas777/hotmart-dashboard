-- Migration 047: soft delete de dashboards (projetos)
--
-- Excluir um dashboard hoje é irreversível na hora (delete direto da linha em
-- `projetos`, com cascade derrubando widgets, custos manuais, permissões etc).
-- Isso passa a ser um "soft delete": marca `deleted_at` em vez de apagar. O
-- dashboard some da listagem normal, mas fica recuperável por 10 dias via
-- tela de lixeira. Depois de 10 dias, um cron job (app/api/cron/purge-dashboards)
-- faz a exclusão definitiva.

ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_projetos_deleted_at
  ON public.projetos (deleted_at)
  WHERE deleted_at IS NOT NULL;
