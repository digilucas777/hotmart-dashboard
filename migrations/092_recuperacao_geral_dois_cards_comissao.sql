-- Remove o widget genérico "Minha Comissão (18%)" (data_source "commission",
-- compartilhado com outros gestores) do projeto Recuperação Geral — Lucas pediu
-- que a comissão seja 18% só até 15/10/2026 e 13% a partir de 16/10/2026, em
-- cards SEPARADOS que nunca somam venda do período um do outro. Isso não dá pra
-- fazer no data_source compartilhado sem afetar outros gestores que usam o
-- mesmo tipo de widget, então foi substituído por dois cards isolados
-- (RecuperacaoComissaoCard, renderizados só nesse projeto via DashboardClient).

delete from dashboard_widgets
where id = 'fa2cfef2-5f4e-4456-b2ce-75376da45bf2'
  and projeto_id = 'c646c137-700f-47ba-bfb7-929f0a894b2f'
  and data_source = 'commission';
