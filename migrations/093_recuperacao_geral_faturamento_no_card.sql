-- Remove o widget genérico "Total Convertido (BRL)" do projeto Recuperação Geral —
-- Lucas pediu que o Faturamento apareça na mesma linha e com o mesmo destaque dos
-- dois cards de comissão (18%/13%). Passou a ser o primeiro dos 3 tiles dentro do
-- RecuperacaoComissaoCard; o widget genérico (data_source "total_converted",
-- compartilhado com outros projetos) ficaria duplicado, então foi removido só
-- desse projeto.

delete from dashboard_widgets
where id = 'b4d212b6-b918-45b0-b1bd-4a26ddd08161'
  and projeto_id = 'c646c137-700f-47ba-bfb7-929f0a894b2f'
  and data_source = 'total_converted';
