-- Hottok da Hotmart (2º fator do webhook de venda), guardado criptografado.
-- Com ele cadastrado, o Worker recusa qualquer venda que chegue sem o
-- cabeçalho X-HOTMART-HOTTOK correto, mesmo que a URL do webhook vaze.
ALTER TABLE public.track_installations
  ADD COLUMN IF NOT EXISTS hotmart_hottok_encrypted text;
