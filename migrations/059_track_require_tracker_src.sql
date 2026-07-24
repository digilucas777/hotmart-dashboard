-- Migration 059: interruptor por instalação — só manda Purchase pra Meta
-- quando o "src" (com o sufixo "-tracker" já colado pelo nosso script)
-- confirma que a venda veio do funil rastreado por essa instalação.
--
-- Aditivo apenas, desligado por padrão (false) — não muda o comportamento
-- de nenhuma instalação existente até o usuário ligar explicitamente. Sem
-- isso, o webhook da Hotmart (configurado por produto, não por domínio/
-- pixel/campanha) manda TODA venda aprovada do produto pra Meta via essa
-- instalação, mesmo vendas de outro pixel/campanha que vende o mesmo
-- produto sem passar pelo funil rastreado aqui.

ALTER TABLE public.track_installations
  ADD COLUMN IF NOT EXISTS require_tracker_src boolean NOT NULL DEFAULT false;
