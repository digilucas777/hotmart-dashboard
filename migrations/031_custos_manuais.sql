CREATE TABLE public.custos_manuais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  data date NOT NULL,
  valor numeric NOT NULL,
  moeda text NOT NULL DEFAULT 'USD',
  descricao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.custos_manuais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user acessa os próprios" ON public.custos_manuais
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projetos WHERE id = projeto_id AND user_id = auth.uid())
  );

CREATE INDEX custos_manuais_projeto_data_idx ON public.custos_manuais (projeto_id, data);
