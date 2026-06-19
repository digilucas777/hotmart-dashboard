-- Passo 1: suporte a múltiplas conexões Meta
ALTER TABLE public.meta_connections ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.meta_connections ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

CREATE TABLE IF NOT EXISTS public.meta_project_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  meta_connection_id uuid NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(projeto_id, meta_connection_id)
);

ALTER TABLE public.meta_project_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user acessa as próprias" ON public.meta_project_connections
  FOR ALL USING (
    EXISTS (SELECT 1 FROM meta_connections WHERE id = meta_connection_id AND user_id = auth.uid())
  );
