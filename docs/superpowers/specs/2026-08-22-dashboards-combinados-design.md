# Dashboards combinados (multi-projeto)

## Contexto

Hoje cada dashboard (`/dashboard/[id]`) mostra métricas e vendas de **um projeto só** (ex: `🟢 [IT] Lucas`, `🔵 [Fr] Lucas`, `🟡 [Es] Lucas`). O usuário quer poder escolher vários projetos de uma vez (ex: IT + FR + ES) e ver o faturamento e as métricas somados, além de uma aba de transações com as vendas de todos os projetos escolhidos juntas — sem precisar abrir cada dashboard separado e somar na mão.

Confirmado com dados reais (consulta em produção) que esses projetos realmente misturam moeda — IT e ES têm vendas em BRL/USD, FR tem BRL/EUR/USD — então a conversão pra uma moeda só é uma necessidade real, não hipotética.

Decisões já validadas com o usuário:
- Tela combinada mostra **cards de totais + aba de transações combinada** — não tenta juntar os widgets customizados de cada dashboard individual (cada projeto pode ter um layout de widgets diferente; juntar isso ficaria confuso e é fora de escopo).
- Acesso via um botão **"Combinar dashboards"** dentro da página atual "Meus Dashboards" (`components/saas/UserAppShell.tsx`) — não é um item novo na barra lateral.
- A combinação escolhida (ex: "Europa" = IT+FR+ES) fica **salva**, pra reabrir depois sem reselecionar. Pode haver mais de uma combinação salva.
- Métricas combinadas cobrem só o que vem de **vendas** (faturamento, comissão, contagem por status, ticket médio). Métricas que dependem de gasto com anúncio (ROAS, lucro, CPA) ficam de fora desta versão — cada projeto pode ter conta de anúncio diferente, e combinar isso corretamente é um projeto separado.
- Disponível **só para admin** por enquanto (mesmo padrão já usado no módulo de Rastreamento — `profile?.role !== 'admin'` bloqueia com 403).

## Modelo de dados

Nova tabela `dashboard_combos`:

| coluna | tipo | observação |
|---|---|---|
| `id` | uuid, PK | |
| `user_id` | uuid, FK -> auth.users | dono da combinação |
| `nome` | text | ex: "Europa" |
| `projeto_ids` | uuid[] | IDs de `projetos` incluídos |
| `ordem` | int | pra ordenar a lista de combinações salvas |
| `created_at` | timestamptz | default now() |

RLS: mesmo padrão de tabelas já existentes que pertencem a um usuário (`user_id = auth.uid()` para select/insert/update/delete). O admin-only fica garantido na camada de aplicação (a página verifica `role === 'admin'` antes de mostrar/permitir qualquer coisa), não na RLS — assim, se um dia a restrição admin-only for removida, a tabela já funciona corretamente por usuário sem precisar de migration nova.

Nenhuma mudança nas tabelas `vendas`, `projetos`, `projeto_produtos` — a feature só lê o que já existe.

## Fluxo de uso

1. Em "Meus Dashboards" (`UserAppShell.tsx`), um botão **"Combinar dashboards"** (visível só se `isAdmin`), ao lado do botão "Novo dashboard" já existente.
2. Abre um modal: campo de nome (ex: "Europa") + lista dos projetos do usuário com checkbox (reaproveita a mesma lista `dashboards` já carregada por `loadDashboards()` — não precisa de nova consulta). Botão "Salvar" grava em `dashboard_combos` e navega para a tela do combinado.
3. Nova rota `/dashboard/combinado/[id]` (id = o id da linha em `dashboard_combos`): mostra o nome do combinado, filtro de período (reaproveita `<PeriodFilter>`, mesmo componente já usado nos dashboards individuais), cards de totais, e a aba de transações.
4. Em "Meus Dashboards", uma nova seção **"Combinados"** (abaixo de "Todos os dashboards", mesmo estilo de seção que "Sites monitorados"/"Conectar integrações" já usam) lista as combinações salvas, cada uma com: nome, quantos projetos, um botão de abrir e um de excluir. Editar quais projetos entram = abrir o mesmo modal do passo 2 pré-preenchido.

## Cálculo dos totais

Sem lógica de cálculo nova. Pra cada `projeto_id` da combinação, chama `fetchVendasSummary(projetoId, from, to)` (já existe, `lib/vendas-aggregation.ts`) em paralelo (`Promise.all`), concatena todas as `SummaryRow[]` recebidas numa lista só, e passa essa lista combinada pra `computeWidgetDataFromSummary` (já existe, mesma função que os dashboards individuais já usam) — como essa função já agrupa por `status`/`moeda` internamente, concatenar as linhas de N projetos antes de calcular já produz o total correto, sem precisar tocar na função.

Cards mostrados (mesmos `data_source` que já existem, só que alimentados pelos dados combinados): `total_converted`, `total_brl`, `total_usd`, `sales_count`, `approval_rate`, `avg_ticket`, `commission`, `refunds_count`, `chargebacks_count`, `disputed_count`, `pending_count`, `cancelled_count`. A taxa de câmbio usada é a mesma rota já existente (`/api/exchange-rate`), chamada uma vez pra tela inteira (não por projeto).

## Aba de transações

Reaproveita o componente `SalesTable` (já usado em `/vendas`) sem nenhuma mudança nele. A tela combinada resolve a lista de `hotmart_id` de produto permitidos a partir dos `projeto_ids` da combinação (mesma consulta em duas etapas já usada em `app/vendas/page.tsx`: `projeto_produtos` → `produtos.hotmart_id`), busca `vendas` filtradas por esses IDs e pelo período selecionado, e passa o resultado pra `<SalesTable vendas={...} exchangeRate={...} />` — mesmo padrão, só troca a origem da lista de produtos permitidos.

## Erros e casos de borda

- Combinação sem nenhum projeto selecionado: botão "Salvar" desabilitado até marcar pelo menos 1.
- Um projeto que estava na combinação foi excluído depois: a tela do combinado ignora silenciosamente o `projeto_id` que não existir mais (mesmo espírito do resto do sistema — não quebra a tela por um dado órfão).
- Falha ao buscar o resumo de algum projeto (ex: instabilidade passageira): mostra o mesmo aviso de erro com botão "Tentar de novo" já padronizado nesta sessão (`UserAppShell.tsx`) — sem widget/skeleton pendurado pra sempre.
- Página verifica `role === 'admin'` antes de renderizar qualquer coisa da feature; quem não é admin não vê o botão "Combinar dashboards" nem a seção "Combinados".

## Fora de escopo (nesta versão)

- Métricas de anúncio combinadas (ROAS, lucro, CPA, gasto).
- Abrir a feature para usuários não-admin.
- Editar manualmente o layout/ordem dos cards da tela combinada (usa uma ordem fixa, igual à lista acima).
