-- 08/10/2026: reconciliação manual do Tráfego Espanhol (Lucas) com o
-- extrato pulado na Hotmart revelou que 2 produtos vinculados a
-- "🟡 [Es] Lucas" não são do tráfego de Lucas:
--   - "Curso de Masaje Tántrico ©" (hotmart_id 7350091) — confirmado pelo
--     usuário que não é do tráfego.
--   - "Oral inolvidable - ¡Hazla Delirar!®" (hotmart_id 7051758) —
--     confirmado pelo usuário que é da recuperação/app (já compartilhado
--     com 📲APP-ESPANHOL com todas_ofertas=true; o Tráfego tinha uma
--     restrição de oferta específica 'wimngr8m', mas o usuário confirmou
--     que nem essa fatia deveria contar no tráfego).
--
-- O usuário já havia removido hoje, pela própria tela de edição, outros
-- 8 produtos (7 "®" do App-Espanhol/Pedro + "Joyce Privado ©") — esses 2
-- aqui ficaram de fora dessa limpeza e foram confirmados nesta conversa.
--
-- Ver memória tantric_women_app_trafego_split.md para o caso irmão em
-- inglês (lá a solução foi split por origem porque a venda era legítima
-- dos dois lados; aqui os produtos simplesmente não pertencem ao tráfego
-- de Lucas, então a correção é só desvincular).

delete from projeto_produto_ofertas
where projeto_id = '314861f2-63b1-48d6-b1ea-6208fd64176c'
  and produto_id in (
    '8c05c51d-2a64-400e-b506-1256b9f120a5', -- Curso de Masaje Tántrico © (7350091)
    'bf7a1f04-b0e4-47f8-a386-d97830cdc0bf'  -- Oral inolvidable - ¡Hazla Delirar!® (7051758)
  );

delete from projeto_produtos
where projeto_id = '314861f2-63b1-48d6-b1ea-6208fd64176c'
  and produto_id in (
    '8c05c51d-2a64-400e-b506-1256b9f120a5',
    'bf7a1f04-b0e4-47f8-a386-d97830cdc0bf'
  );
