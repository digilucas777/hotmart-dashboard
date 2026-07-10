# Design: Monitoramento de Sites (checagem automática de páginas de anúncio)

**Data:** 2026-07-10
**Repositório:** hotmart-dashboard
**Stack:** Next.js (App Router) + Supabase + Tailwind CSS + TypeScript + Vercel + GitHub Actions

---

## Objetivo

O usuário anuncia no Meta Ads apontando pra várias páginas de venda (ex: `https://cursosjoy.site/`, `https://cursosjoy.site/qz-wl-vs-nv/`). Se uma dessas páginas cai, demora demais pra carregar, ou passa a retornar erro, o investimento em anúncio continua rodando e as vendas param de converter sem ninguém perceber a tempo.

Este projeto adiciona uma aba "Sites" no painel onde cada usuário cadastra os sites/páginas que anuncia, e um bot que confere todas essas páginas **automaticamente, de hora em hora, 24/7, sem depender do computador do usuário estar ligado** — notificando por push quando alguma apresentar problema.

Requisitos confirmados com o usuário:
- Escopo **por usuário** (cada um vê e gerencia só os seus sites), com uma visão agregada só pro admin.
- Notificação vai só pro dono do site (não pro admin também).
- Considera "problema": site fora do ar / erro de servidor, página não encontrada (4xx) / redirecionamento quebrado, e carregamento lento (definido como **mais de 10 segundos** de resposta).
- Enquanto o problema persistir, notifica **a cada checagem** (de hora em hora), não só uma vez. Quando o site volta ao normal depois de ter tido problema, notifica **uma vez** de "voltou ao ar".

---

## Por que GitHub Actions em vez do Cron da Vercel

Já existe um cron na Vercel pro expurgo da lixeira de dashboards (`vercel.json`, diário). Só que o plano gratuito (Hobby) da Vercel limita cron jobs a rodar no máximo **1 vez por dia**, com horário aproximado — não dá pra rodar de hora em hora nesse plano. Em vez de depender de upgrade de plano, um workflow do GitHub Actions agendado (`cron: '0 * * * *'`) faz uma chamada HTTP simples pro endpoint de checagem a cada hora — gratuito, roda no GitHub (não no PC do usuário), e não depende do plano da Vercel.

---

## Modelo de dados

### Migration `048_monitored_sites.sql`

```sql
CREATE TABLE public.monitored_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  dominio text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.monitored_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.monitored_sites(id) ON DELETE CASCADE,
  url text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  -- resultado da última checagem
  ultimo_status text, -- 'ok' | 'lento' | 'fora_do_ar' | 'erro_servidor' | 'nao_encontrada'
  ultimo_status_code integer,
  ultimo_tempo_ms integer,
  ultima_checagem_em timestamptz,
  problema_desde timestamptz, -- null quando 'ok'; marca desde quando está com problema
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_monitored_pages_site_id ON public.monitored_pages (site_id);
CREATE INDEX idx_monitored_pages_ativo ON public.monitored_pages (ativo) WHERE ativo = true;

ALTER TABLE public.monitored_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitored_pages ENABLE ROW LEVEL SECURITY;

-- dono gerencia os próprios sites; admin (via helper is_admin() já existente, migration 041) vê todos
CREATE POLICY "dono ve e gerencia seus sites" ON public.monitored_sites
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin ve todos os sites" ON public.monitored_sites
  FOR SELECT USING (public.is_admin());

CREATE POLICY "dono ve e gerencia suas paginas" ON public.monitored_pages
  FOR ALL USING (EXISTS (SELECT 1 FROM public.monitored_sites s WHERE s.id = site_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.monitored_sites s WHERE s.id = site_id AND s.user_id = auth.uid()));
CREATE POLICY "admin ve todas as paginas" ON public.monitored_pages
  FOR SELECT USING (public.is_admin());
```

O cron usa a service role key (bypassa RLS) pra ler/atualizar todas as páginas de todos os usuários numa passada só.

---

## Como a checagem roda

### Rota `app/api/cron/check-sites/route.ts`
Mesmo padrão de proteção do cron de expurgo já existente (`app/api/cron/purge-dashboards/route.ts`): `GET`, exige header `Authorization: Bearer ${CRON_SECRET}` (mesma env var já configurada).

Passo a passo:
1. Busca todas as `monitored_pages` com `ativo = true` (join com `monitored_sites` pra saber `user_id` e `nome`).
2. Pra cada página, em paralelo (com limite de concorrência razoável, ex. 10 por vez): `fetch(url, { signal: AbortSignal.timeout(15_000) })`, medindo o tempo decorrido.
3. Classifica o resultado:
   - Erro de rede / timeout / DNS falhou → `fora_do_ar`
   - Status `>= 500` → `erro_servidor`
   - Status `>= 400` (e não é erro de rede) → `nao_encontrada`
   - Status `2xx`/`3xx` e tempo > 10.000ms → `lento`
   - Status `2xx`/`3xx` e tempo ≤ 10.000ms → `ok`
4. Compara com `ultimo_status` salvo:
   - Se o novo status **não é** `ok` → dispara push pro dono (a cada checagem, enquanto persistir) e, se `problema_desde` estava vazio, marca `problema_desde = now()`.
   - Se o novo status **é** `ok` e o status anterior **não era** `ok` → dispara push de "voltou ao ar" (uma vez), limpa `problema_desde`.
   - Se o novo status é `ok` e já estava `ok` → não notifica.
5. Atualiza `monitored_pages` com o novo status/tempo/timestamp.

### Envio do push
Reaproveita a infraestrutura existente em `lib/push.ts` (mesma tabela `push_subscriptions`, mesmo `webpush.sendNotification`). Adiciona uma função nova `notifySiteIssue(userId, siteName, url, status, statusCode, tempoMs)` e uma `notifySiteRecovered(userId, siteName, url)`, seguindo o mesmo padrão de tratamento de erro 404/410 (remove inscrição morta) já usado em `notifySale`. Não precisa de uma nova entrada em `notification_preferences` — quem já ativou push em `/configuracoes` recebe esses avisos também (é uma categoria só, não configurável por enquanto).

### Workflow `.github/workflows/check-sites.yml`
```yaml
name: Checar sites monitorados
on:
  schedule:
    - cron: '0 * * * *'
  workflow_dispatch: {}
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Chamar endpoint de checagem
        run: |
          curl -sf -X GET "https://hotmart-dashboard-woad.vercel.app/api/cron/check-sites" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```
`workflow_dispatch` permite disparar manualmente pra testar. `CRON_SECRET` precisa ser cadastrado como secret do repositório no GitHub (mesmo valor já usado na Vercel).

---

## Tela

### Nova aba "Sites" (`app/sites/page.tsx`), visível no menu principal pra qualquer usuário logado

- Lista os **sites do próprio usuário**: cada site é um cartão com nome + domínio, e dentro dele a lista de páginas cadastradas.
- Cada página mostra: URL, uma bolinha de status (🟢 ok / 🟡 lento / 🔴 fora do ar ou erro / ⚪ nunca checado ainda), código HTTP da última checagem, tempo de resposta, e "checado há X min/h".
- Botões: "Novo site" (nome + domínio opcional), "Adicionar página" dentro de cada site (só a URL), excluir site/página, pausar página (`ativo = false`, some da rotação de checagem sem perder o histórico).
- **Seção extra só pro admin** (mesmo padrão de `isAdmin` já usado em outras telas): lista os sites de **todos os usuários**, agrupados por dono, **somente leitura** (admin vê status/URLs de todo mundo, mas adicionar/editar/excluir site continua exclusivo do dono — evita o admin mexer sem querer no que outro usuário configurou).

---

## Fora de escopo (v1)

- Verificação com navegador de verdade (Playwright) pra detectar erro de JS ou página renderizada em branco — só checagem HTTP (status + tempo). Pode virar uma v2 se a checagem simples não for suficiente.
- Preferência de notificação configurável por site (silenciar um site específico) — todos os sites do usuário notificam da mesma forma por enquanto.
- Histórico/gráfico de uptime ao longo do tempo — só o estado mais recente de cada página é mantido, sem tabela de histórico de checagens.

---

## Verificação

- `npx tsc --noEmit` limpo.
- Testar a rota de checagem manualmente (`curl` com o `CRON_SECRET` certo) contra um site real que responde e um domínio inexistente, confirmar que classifica corretamente e grava no banco.
- Testar o workflow do GitHub Actions via `workflow_dispatch` manual antes de confiar no agendamento automático.
- Cadastrar um site na tela, forçar uma checagem manual, confirmar que o status muda na UI e que chega push (down → up) no dispositivo com push ativado.
