-- Migration 044: trava contra notificação push duplicada
--
-- A Hotmart pode mandar mais de um webhook pro mesmo evento de uma venda
-- (ex: PURCHASE_APPROVED e depois PURCHASE_COMPLETE, ambos virando a mesma
-- categoria "venda_realizada"). Sem essa trava, cada chamada de webhook
-- dispara uma notificação nova, mesmo sendo a mesma venda.
--
-- Essa tabela guarda "já notifiquei esse projeto sobre essa venda nessa
-- categoria" — antes de enviar, tenta inserir; se já existir (conflito na
-- chave única), pula o envio.

CREATE TABLE public.notified_sale_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotmart_id text NOT NULL,
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  categoria text NOT NULL,
  notified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(hotmart_id, projeto_id, categoria)
);

-- Sem RLS necessário — só o webhook (service role) escreve e lê aqui.
ALTER TABLE public.notified_sale_events ENABLE ROW LEVEL SECURITY;
