-- Migration 058: campo "src" no painel de eventos do Rastreamento
--
-- Aditivo apenas. O usuário quer ver o parâmetro "src" (já usado pela
-- Hotmart/relatórios de origem existentes, ver migration 008) também no
-- nosso painel de diagnóstico — tanto capturado da URL da página (quando
-- presente) quanto vindo do payload do webhook de compra aprovada
-- (data.purchase.origin.src, a mesma fonte que já alimenta vendas.origem).
-- Isso é só exibição no nosso painel — não usamos "src" pra cruzar sessão
-- (isso continua sendo só o "sck", como já decidido).

ALTER TABLE public.track_events
  ADD COLUMN IF NOT EXISTS src text;
