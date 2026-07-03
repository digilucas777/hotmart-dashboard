# Design: Acesso restrito para Gestor de Tráfego (projeto "TRÁFEGO - [PEDRO]")

**Data:** 2026-07-03
**Repositório:** hotmart-dashboard
**Stack:** Next.js (App Router) + Supabase + Tailwind CSS + TypeScript + Vercel

---

## Objetivo

Permitir convidar um gestor de tráfego (ex: Pedro) para um projeto específico, com acesso **somente leitura** ao dashboard, sem risco de:

- ver ou mexer em outros projetos;
- ver a tabela detalhada de vendas, a área Admin ou a área de Integrações;
- ver tokens/credenciais de WhatsApp ou Meta Ads;
- ver faturamento/gastos anteriores a uma data de corte definida pelo dono.

O gestor deve conseguir: ver o dashboard do projeto, inserir custo manual, e configurar/copiar relatórios para WhatsApp (sem ver a conexão/token).

Esse conjunto de restrições deve virar um **preset reutilizável** ("Gestor de Tráfego"), aplicável a qualquer projeto/convite futuro com um clique, para não depender de marcar checkboxes manualmente toda vez.

---

## Achados durante a investigação (pré-existentes, não causados por este projeto)

O sistema já tem um embrião de controle de acesso por projeto (tabela `user_dashboard_permissions`, migration `029`, e uma tela de convite em `/admin`). Durante a investigação para este design, dois problemas de segurança reais foram encontrados e serão corrigidos como parte deste trabalho:

1. **RLS (regras de segurança do banco Supabase) não conhece `user_dashboard_permissions`.** As políticas em `migrations/033_rls_all_tables.sql` para `projetos`, `produtos`, `vendas`, `dashboard_widgets`, `custos_manuais`, `projeto_produtos`, `projeto_produto_ofertas` e `whatsapp_report_schedules` liberam acesso **apenas** para `projetos.user_id = auth.uid()` (o dono). Um usuário convidado via `user_dashboard_permissions` é bloqueado pelo banco mesmo tendo permissão de app — hoje, qualquer convite feito nunca funcionaria de fato (tela ficaria vazia). Correção obrigatória para o recurso funcionar.
2. **`whatsapp_connections` (tokens de API do WhatsApp) é legível/gravável por qualquer usuário autenticado**, não só o dono (`migrations/010_whatsapp_reports.sql` + policy em `033` usa `auth.uid() IS NOT NULL`). Qualquer pessoa com login no sistema hoje consegue ler `access_token` e `evolution_api_key` de **todos os projetos** via chamada direta ao Supabase pelo navegador. Corrigido como parte deste trabalho.

Os demais pontos sensíveis (tokens do Meta Ads em `meta_connections`, chave de serviço do Supabase) já estão corretamente protegidos hoje (RLS por dono / uso restrito ao servidor) — nada a corrigir ali.

---

## Modelo de dados

### Migration: ampliar `user_dashboard_permissions`

```sql
ALTER TABLE public.user_dashboard_permissions
  ADD COLUMN IF NOT EXISTS pode_ver_vendas boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pode_adicionar_custo_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pode_ver_conexao_whatsapp boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dados_visiveis_a_partir date;
```

- `dados_visiveis_a_partir` — quando preenchida, é a data de corte: a pessoa não vê nenhum dado (venda, custo, gráfico, total) anterior a essa data. `NULL` = sem restrição (comportamento do dono/admin).
- Colunas já existentes (`pode_editar_layout`, `pode_adicionar_widgets`, `pode_configurar_produtos`, `pode_ver_produtos_ofertas`, `pode_excluir_dashboard`, `is_admin_dashboard`) continuam com o mesmo significado.

### Preset "Gestor de Tráfego" (aplicado na tela de convite, não é uma tabela nova)

| Campo | Valor |
|---|---|
| `pode_visualizar` | true |
| `pode_ver_vendas` | false |
| `pode_editar_layout` | false |
| `pode_adicionar_widgets` | false |
| `pode_configurar_produtos` | false |
| `pode_ver_produtos_ofertas` | false |
| `pode_excluir_dashboard` | false |
| `pode_adicionar_custo_manual` | true |
| `pode_ver_conexao_whatsapp` | false |
| `is_admin_dashboard` | false |
| `dados_visiveis_a_partir` | data escolhida pelo dono no momento do convite |

---

## Regras de segurança no banco (RLS) — a proteção "de verdade"

Migration nova (próximo número disponível, `036`) que:

1. Adiciona a cada policy de `SELECT` afetada (`projetos`, `produtos`, `dashboard_widgets`, `projeto_produtos`, `projeto_produto_ofertas`) uma cláusula `OR EXISTS (SELECT 1 FROM user_dashboard_permissions udp WHERE udp.projeto_id = ... AND udp.user_id = auth.uid() AND udp.pode_visualizar = true)`, mantendo a condição de dono já existente.
2. Em `vendas` e `custos_manuais`, a mesma cláusula acima **mais** o corte de data: quando existe permissão via `user_dashboard_permissions` (ou seja, quem não é dono), só libera linhas com `data_venda >= udp.dados_visiveis_a_partir` (ou `data >= udp.dados_visiveis_a_partir` em `custos_manuais`), e só quando `udp.dados_visiveis_a_partir IS NULL` libera tudo. Isso é reforçado no banco — não dá pra contornar mudando algo na tela.
3. Permite `INSERT` em `custos_manuais` para quem tem `pode_adicionar_custo_manual = true` no projeto.
4. Restringe `whatsapp_connections` a: dono do(s) projeto(s) que usam aquela conexão via `whatsapp_report_schedules`, OU `role = 'admin'`. Convidados sem `pode_ver_conexao_whatsapp` nunca recebem linha nenhuma dessa tabela.
5. Cria uma pequena rota de servidor (`/api/relatorios/connection-id`) que devolve **apenas o ID** da conexão de WhatsApp ativa de um projeto (sem token nenhum) para quem tem `pode_visualizar` mas não `pode_ver_conexao_whatsapp` — usada para permitir salvar/enviar relatório sem expor a conexão na tela.

---

## Mudanças de interface

- **`components/layout/Sidebar.tsx`**: passa a carregar a permissão do usuário para o projeto atual (reaproveitando o padrão já usado em `DashboardClient.tsx`) e esconde o item "Vendas" quando `pode_ver_vendas` for `false` e o usuário não for dono/admin. Esconde também "Integrações" nesse caso (ver "Suposições" abaixo).
- **`app/vendas/...` (página de Vendas)**: adiciona guarda de permissão (mesmo padrão de redirecionamento já usado em `DashboardClient.tsx:955-981`) — quem não tem `pode_ver_vendas` é redirecionado para fora ao tentar acessar a URL diretamente.
- **`app/admin/page.tsx`**: sem mudança de proteção (já redireciona quem não é admin); ganha o botão/preset "Gestor de Tráfego" e o campo de data de corte no formulário de convite.
- **`app/dashboard/[id]/DashboardClient.tsx`**: adiciona `canAddCustoManual` (hoje inexistente — a ação não é protegida por nenhuma flag) usando a nova coluna; aplica o corte de data no carregamento de vendas/custos para não-donos; o seletor de projetos (`dashboardOptions`) já passa a mostrar só os projetos permitidos automaticamente, como efeito colateral da correção de RLS.
- **`app/relatorios/page.tsx`**: some o acordeão "WhatsApp" (conexão/QR/token) quando `pode_ver_conexao_whatsapp` for `false`; o formulário de agendamento usa a nova rota `/api/relatorios/connection-id` para obter a conexão sem exibi-la; o `<select>` de projeto passa a listar só os projetos permitidos (hoje lista todos, sem filtro).
- **`app/integracoes/page.tsx`**: sem mudança de código — já fica de fato inacessível/vazia para não-donos porque `meta_connections` já é protegida por dono; a mudança aqui é só escondida do menu lateral para não parecer quebrada.

---

## Revisão geral de segurança (escopo ampliado)

Além do necessário para o Pedro, como parte do mesmo trabalho:

- Varredura no código por `console.log`/`console.error` que exponham dados de vendas, filtros ou identificadores em telas de produção (ex: `app/projects/page.tsx:184`, `DashboardClient.tsx:1500-1504`) — removidos.
- Varredura por qualquer variável `NEXT_PUBLIC_*` ou valor hardcoded que devesse ser segredo de servidor.
- Revisão das políticas RLS de todas as tabelas restantes (fora as já listadas acima) atrás de políticas `USING (true)` ou equivalentes esquecidas.

---

## Suposições a confirmar (marcadas para revisão)

- **Aba "Integrações" escondida para o preset "Gestor de Tráfego"** — não foi pedido explicitamente, mas como ela ficaria vazia/quebrada para um convidado (Meta Ads é protegido por dono) e trata de credenciais de anúncio, a decisão de design foi escondê-la também. Fácil de reverter se você quiser que o Pedro veja essa aba no futuro.
- **Corte de data aplica-se a vendas E custos, por data do evento (`data_venda`/`data`), não por data de cadastro no sistema** — consistente com "faturamento e gastos a partir de 02/07".
- **Limite técnico:** a proteção "de verdade" contra um usuário tecnicamente sofisticado (que inspecione requisições de rede) é a regra de banco (RLS) — ela garante que ninguém além do projeto liberado e da data de corte consegue puxar dados, mesmo contornando a tela. Impedir 100% que alguém tecnicamente avançado descubra que a tabela `vendas` existe e reconstrua uma lista via consultas diretas (em vez de olhar a aba "Vendas") exigiria trocar a arquitetura para uma API de agregação no servidor — isso fica de fora do escopo deste projeto por ora.

---

## Fora de escopo

- Middleware de autenticação no `Next.js` (o app inteiro hoje verifica login no cliente, sem `middleware.ts`; manter esse padrão existente para esta mudança, não reescrever a arquitetura de autenticação do zero).
- Reformular a tela de Integrações ou trocar como o Meta Ads é conectado.
- Criar papéis (roles) além de `admin` / `user` no banco — a distinção "Gestor de Tráfego" vive inteiramente em `user_dashboard_permissions`, não em `user_profiles.role`.
- Auditoria de segurança de infraestrutura (Vercel, DNS, etc.) — o escopo aqui é código e banco de dados do próprio projeto.
