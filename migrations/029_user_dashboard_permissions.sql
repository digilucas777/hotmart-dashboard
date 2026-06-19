CREATE TABLE public.user_dashboard_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  pode_visualizar boolean NOT NULL DEFAULT true,
  pode_editar_layout boolean NOT NULL DEFAULT false,
  pode_adicionar_widgets boolean NOT NULL DEFAULT false,
  pode_configurar_produtos boolean NOT NULL DEFAULT false,
  pode_ver_produtos_ofertas boolean NOT NULL DEFAULT false,
  pode_excluir_dashboard boolean NOT NULL DEFAULT false,
  is_admin_dashboard boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, projeto_id)
);

ALTER TABLE public.user_dashboard_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin vê tudo" ON public.user_dashboard_permissions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "user vê as próprias" ON public.user_dashboard_permissions
  FOR SELECT USING (user_id = auth.uid());
