# Dashboards Combinados (multi-projeto) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o usuário escolher vários projetos (dashboards) de uma vez, salvar essa combinação, e ver o faturamento/métricas de vendas somados + uma aba de transações combinada.

**Architecture:** Nova tabela `dashboard_combos` (uma combinação salva = nome + lista de `projeto_ids`, dono = `user_id`). Uma nova rota `/dashboard/combinado/[id]` busca o resumo agregado (`get_vendas_summary`) de cada projeto da combinação em paralelo, concatena os resultados e reaproveita `computeWidgetDataFromSummary` (já existe) pra calcular os cards de totais — sem nenhuma lógica de cálculo nova. A aba de transações reaproveita `SalesTable` (já existe), só troca de onde vem a lista de `hotmart_id` permitidos. Botão de criar/gerenciar combinações fica em "Meus Dashboards" (`UserAppShell.tsx`), admin-only.

**Tech Stack:** Next.js 15 (App Router, client components), Supabase (Postgres + RLS), TypeScript, Tailwind.

## Global Constraints

- Só admin (`user_profiles.role = 'admin'`) pode ver/usar essa feature — verificado na camada de aplicação, nunca só na RLS.
- Reaproveitar sem modificar: `fetchVendasSummary`, `computeWidgetDataFromSummary`, `SalesTable`, `PeriodFilter`, `getPeriodRange` (todos em `lib/vendas-aggregation.ts` / `lib/utils.ts` / `components/dashboard/`).
- Métricas de anúncio (ROAS, lucro, CPA, gasto) ficam fora de escopo — só métricas de vendas.
- **Sem framework de testes**: o app principal (`app/`, `components/`) não tem Jest/Vitest/RTL configurado (só `track-worker` usa `node --test`, que é outro pacote). A verificação de cada tarefa usa `npx tsc --noEmit` (sempre) e, quando fizer sentido, uma consulta SQL de round-trip via Supabase ou um passo manual no navegador — mesmo padrão já usado no resto desta sessão para mudanças em `app/`/`components/`. Não introduzir um test runner novo só para esta feature.
- Sempre rodar `npx tsc --noEmit` sem erros antes de considerar uma tarefa concluída.

---

### Task 1: Migração — tabela `dashboard_combos`

**Files:**
- Create: `migrations/060_dashboard_combos.sql`

**Interfaces:**
- Produces: tabela `public.dashboard_combos(id uuid, user_id uuid, nome text, projeto_ids uuid[], ordem integer, created_at timestamptz)`, usada pelas Tasks 2-6.

- [ ] **Step 1: Escrever a migração**

Crie `migrations/060_dashboard_combos.sql`:

```sql
-- Migration 060: dashboards combinados (multi-projeto)
--
-- dashboard_combos: uma combinacao salva de projetos (ex: "Europa" =
-- IT+FR+ES) que um usuario quer ver com metricas de vendas somadas. Mesmo
-- padrao de tabela-por-usuario de push_subscriptions/notification_
-- preferences (migration 043) — RLS so garante "cada um ve o proprio",
-- a restricao de admin-only fica na camada de aplicacao (nao na RLS), pra
-- funcionar corretamente por usuario se essa restricao for removida no
-- futuro sem precisar de outra migration.

CREATE TABLE public.dashboard_combos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  projeto_ids uuid[] NOT NULL DEFAULT '{}',
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dashboard_combos_user_id_idx ON public.dashboard_combos(user_id);

ALTER TABLE public.dashboard_combos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user manages own combos"
  ON public.dashboard_combos FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
```

- [ ] **Step 2: Aplicar a migração no projeto Supabase**

Use a ferramenta MCP `mcp__claude_ai_Supabase__apply_migration` com `project_id: "czuyzjlqliotwnzfllbe"`, `name: "060_dashboard_combos"` e o conteúdo do arquivo acima como `query`.

- [ ] **Step 3: Verificar a estrutura criada**

Rode via `mcp__claude_ai_Supabase__execute_sql` (mesmo `project_id`):

```sql
select column_name, data_type from information_schema.columns
where table_name = 'dashboard_combos' order by ordinal_position;
```

Esperado: 6 linhas — `id` (uuid), `user_id` (uuid), `nome` (text), `projeto_ids` (ARRAY), `ordem` (integer), `created_at` (timestamp with time zone).

- [ ] **Step 4: Verificar que a RLS está ativa e com a policy certa**

```sql
select relrowsecurity from pg_class where relname = 'dashboard_combos';
select polname, polcmd from pg_policy where polrelid = 'dashboard_combos'::regclass;
```

Esperado: `relrowsecurity = true`; uma policy `"user manages own combos"` com `polcmd = '*'`.

- [ ] **Step 5: Round-trip de inserção/remoção (service role, só confere mecânica da tabela)**

```sql
insert into dashboard_combos (user_id, nome, projeto_ids)
values ('00000000-0000-0000-0000-000000000000', 'teste-plano', array['00000000-0000-0000-0000-000000000000']::uuid[])
returning id, nome, projeto_ids;

delete from dashboard_combos where nome = 'teste-plano';
```

Esperado: o insert retorna a linha com `projeto_ids` como array de 1 elemento; o delete não dá erro. Isso confirma que a tabela aceita o formato de dado que o código das próximas tasks vai mandar.

- [ ] **Step 6: Commit**

```bash
git add migrations/060_dashboard_combos.sql
git commit -m "feat: tabela dashboard_combos pra dashboards combinados (multi-projeto)"
```

---

### Task 2: Tipo `DashboardCombo` + helper `fetchHotmartIdsForProjetos`

**Files:**
- Modify: `lib/types.ts` (adicionar tipo, perto do tipo `Projeto` existente)
- Modify: `lib/vendas-aggregation.ts` (adicionar função, no final do arquivo)

**Interfaces:**
- Consumes: nenhuma (função nova, isolada).
- Produces: `type DashboardCombo` (usado pelas Tasks 4, 5, 6) e `fetchHotmartIdsForProjetos(projetoIds: string[]): Promise<string[]>` (usado pela Task 6).

- [ ] **Step 1: Adicionar o tipo em `lib/types.ts`**

Logo depois do `export type Projeto = {...}` existente (por volta da linha 47), adicione:

```ts
export type DashboardCombo = {
  id: string
  user_id: string
  nome: string
  projeto_ids: string[]
  ordem: number
  created_at: string
}
```

- [ ] **Step 2: Adicionar o helper em `lib/vendas-aggregation.ts`**

No final do arquivo (depois de `fetchDistinctAfiliados`), adicione:

```ts
// Mesma lógica em 2 etapas já usada em app/vendas/page.tsx pra escopar vendas
// por projeto (projeto_produtos -> produtos.hotmart_id), extraída aqui pra
// reaproveitar na tela de dashboards combinados sem duplicar a consulta.
export async function fetchHotmartIdsForProjetos(projetoIds: string[]): Promise<string[]> {
  if (projetoIds.length === 0) return []
  const { data: pp, error: ppError } = await supabase
    .from('projeto_produtos')
    .select('produto_id')
    .in('projeto_id', projetoIds)
  if (ppError) throw ppError

  const produtoIds = Array.from(new Set((pp ?? []).map((r: { produto_id: string }) => r.produto_id)))
  if (produtoIds.length === 0) return []

  const { data: prods, error: prodsError } = await supabase
    .from('produtos')
    .select('hotmart_id')
    .in('id', produtoIds)
  if (prodsError) throw prodsError

  return (prods ?? []).map((r: { hotmart_id: string }) => r.hotmart_id)
}
```

- [ ] **Step 3: Verificar**

Rode:
```bash
npx tsc --noEmit
```
Esperado: nenhum erro.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts lib/vendas-aggregation.ts
git commit -m "feat: tipo DashboardCombo + helper fetchHotmartIdsForProjetos"
```

---

### Task 3: Componente `ComboMetricCards`

**Files:**
- Create: `components/saas/ComboMetricCards.tsx`

**Interfaces:**
- Consumes: `SummaryRow` e `computeWidgetDataFromSummary` de `lib/vendas-aggregation.ts` (Task 2/já existente); `WidgetDataSource` de `lib/types.ts`.
- Produces: `ComboMetricCards({ summary, exchangeRate }: { summary: SummaryRow[]; exchangeRate: number })` — usado pela Task 6.

- [ ] **Step 1: Criar o componente**

```tsx
'use client'

import { computeWidgetDataFromSummary, type SummaryRow } from '@/lib/vendas-aggregation'
import type { WidgetDataSource } from '@/lib/types'

// Só métricas de vendas (sem ROAS/lucro/CPA, que dependem de gasto com
// anúncio por projeto — fora de escopo desta feature, ver spec).
const CARDS: { source: WidgetDataSource; title: string }[] = [
  { source: 'total_converted', title: 'Total Convertido' },
  { source: 'total_brl', title: 'Faturamento BRL' },
  { source: 'total_usd', title: 'Faturamento USD' },
  { source: 'sales_count', title: 'Vendas Aprovadas' },
  { source: 'commission', title: 'Comissão' },
  { source: 'avg_ticket', title: 'Ticket Médio' },
  { source: 'pending_count', title: 'Pendentes' },
  { source: 'refunds_count', title: 'Reembolsos' },
  { source: 'chargebacks_count', title: 'Chargebacks' },
  { source: 'disputed_count', title: 'Reclamadas' },
  { source: 'cancelled_count', title: 'Canceladas' },
  { source: 'approval_rate', title: 'Taxa de Aprovação' },
]

export function ComboMetricCards({ summary, exchangeRate }: { summary: SummaryRow[]; exchangeRate: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {CARDS.map(({ source, title }) => {
        const data = computeWidgetDataFromSummary(summary, source, exchangeRate)
        if (!data || data.kind !== 'metric') return null
        return (
          <div key={source} className="rounded-2xl border border-white/10 bg-[#0b0d14] p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
            <p className="mt-2 text-2xl font-black text-white">{data.value}</p>
            <p className="mt-1 text-xs text-slate-500">{data.subValue}</p>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit
```
Esperado: nenhum erro.

- [ ] **Step 3: Commit**

```bash
git add components/saas/ComboMetricCards.tsx
git commit -m "feat: ComboMetricCards (cards de totais dos dashboards combinados)"
```

---

### Task 4: Componente `CombineDashboardsModal`

**Files:**
- Create: `components/saas/CombineDashboardsModal.tsx`

**Interfaces:**
- Consumes: `DashboardCombo`, `Projeto` de `lib/types.ts` (Task 2); `supabase` de `lib/supabase.ts`.
- Produces: `CombineDashboardsModal({ open, onClose, projetos, userId, combo, onSaved })` — usado pelas Tasks 5 e 6. `combo: DashboardCombo | null` (`null` = criar nova; preenchido = editar). `onSaved: (combo: DashboardCombo) => void`.

- [ ] **Step 1: Criar o componente**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { DashboardCombo, Projeto } from '@/lib/types'

export function CombineDashboardsModal({
  open,
  onClose,
  projetos,
  userId,
  combo,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  projetos: Projeto[]
  userId: string
  combo: DashboardCombo | null
  onSaved: (combo: DashboardCombo) => void
}) {
  const [nome, setNome] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setNome(combo?.nome ?? '')
    setSelectedIds(combo?.projeto_ids ?? [])
    setError('')
  }, [open, combo])

  if (!open) return null

  function toggle(id: string) {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  async function save() {
    if (!nome.trim() || selectedIds.length === 0) return
    setSaving(true)
    setError('')

    if (combo) {
      const { data, error: updateError } = await supabase
        .from('dashboard_combos')
        .update({ nome: nome.trim(), projeto_ids: selectedIds })
        .eq('id', combo.id)
        .select()
        .single()
      setSaving(false)
      if (updateError || !data) { setError('Não foi possível salvar as alterações.'); return }
      onSaved(data as DashboardCombo)
      return
    }

    const { data, error: insertError } = await supabase
      .from('dashboard_combos')
      .insert({ nome: nome.trim(), projeto_ids: selectedIds, user_id: userId })
      .select()
      .single()
    setSaving(false)
    if (insertError || !data) { setError('Não foi possível criar a combinação.'); return }
    onSaved(data as DashboardCombo)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#0b0d14] p-6 shadow-2xl shadow-black/50">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
              {combo ? 'Editar combinação' : 'Nova combinação'}
            </p>
            <h2 className="mt-1 text-xl font-black">Combinar dashboards</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 text-slate-400 hover:text-white">
            <X size={17} />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-500">Nome da combinação</span>
          <input
            autoFocus
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder="Ex: Europa"
            className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition-colors placeholder:text-slate-700 focus:border-cyan-300/60"
          />
        </label>

        <div className="mt-4">
          <span className="mb-1.5 block text-xs font-semibold text-slate-500">Projetos ({selectedIds.length} selecionados)</span>
          <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-2xl border border-white/10 bg-black/25 p-3">
            {projetos.length === 0 && (
              <p className="px-2 py-3 text-sm text-slate-500">Nenhum dashboard disponível.</p>
            )}
            {projetos.map(p => (
              <label key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-white/[0.04]">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(p.id)}
                  onChange={() => toggle(p.id)}
                  className="h-4 w-4 rounded border-white/20 bg-black/40 accent-cyan-400"
                />
                <span className="font-semibold text-slate-200">{p.nome}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={onClose} className="h-12 flex-1 rounded-2xl border border-white/10 text-sm font-black text-slate-300 transition-colors hover:text-white">
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!nome.trim() || selectedIds.length === 0 || saving}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 text-sm font-black text-white disabled:opacity-50"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {combo ? 'Salvar' : 'Criar combinação'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit
```
Esperado: nenhum erro.

- [ ] **Step 3: Commit**

```bash
git add components/saas/CombineDashboardsModal.tsx
git commit -m "feat: CombineDashboardsModal (criar/editar combinação de dashboards)"
```

---

### Task 5: Botão + seção "Combinados" em `UserAppShell.tsx`

**Files:**
- Modify: `components/saas/UserAppShell.tsx`

**Interfaces:**
- Consumes: `CombineDashboardsModal` (Task 4), `DashboardCombo` (Task 2).
- Produces: nada consumido por outras tasks — ponto de entrada final da UI de gerenciamento de combinações.

- [ ] **Step 1: Adicionar imports**

No topo do arquivo, no bloco de import de ícones (linha 6-28), adicione `Layers` na lista (ordem alfabética, entre `ImageIcon` e `LayoutDashboard`):

```ts
  ImageIcon,
  Layers,
  LayoutDashboard,
```

Depois do `import type { Projeto } from '@/lib/types'` (linha 30), troque por:

```ts
import type { Projeto, DashboardCombo } from '@/lib/types'
import { CombineDashboardsModal } from './CombineDashboardsModal'
```

- [ ] **Step 2: Adicionar estado**

Depois de `const [dragIndex, setDragIndex] = useState<number | null>(null)` (linha 100), adicione:

```ts
  const [combos, setCombos] = useState<DashboardCombo[]>([])
  const [comboModalOpen, setComboModalOpen] = useState(false)
  const [editingCombo, setEditingCombo] = useState<DashboardCombo | null>(null)
  const [deleteComboTarget, setDeleteComboTarget] = useState<DashboardCombo | null>(null)
  const [deletingCombo, setDeletingCombo] = useState(false)
```

- [ ] **Step 3: Adicionar `loadCombos` e chamar no admin-check**

Depois da função `loadSiteStats` (linha 134-140), adicione:

```ts
  async function loadCombos() {
    const { data } = await supabase
      .from('dashboard_combos')
      .select('*')
      .order('created_at', { ascending: true })
    setCombos((data ?? []) as DashboardCombo[])
  }
```

Dentro do `useEffect` principal, ache este trecho (linha ~150-157):

```ts
      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle()
        if (active && profile?.role === 'admin') setIsAdmin(true)
      }
```

E troque por (só adiciona a chamada de `loadCombos()` dentro do `if`, resto igual):

```ts
      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle()
        if (active && profile?.role === 'admin') {
          setIsAdmin(true)
          void loadCombos()
        }
      }
```

- [ ] **Step 4: Adicionar função de excluir combinação**

Depois da função `deleteDashboard` (linha 370-390), adicione:

```ts
  async function deleteCombo() {
    if (!deleteComboTarget) return
    setDeletingCombo(true)
    const { error: deleteError } = await supabase.from('dashboard_combos').delete().eq('id', deleteComboTarget.id)
    setDeletingCombo(false)
    if (deleteError) {
      setError('Não foi possível excluir esta combinação agora.')
      return
    }
    setCombos(prev => prev.filter(c => c.id !== deleteComboTarget.id))
    setDeleteComboTarget(null)
  }
```

- [ ] **Step 5: Adicionar o botão "Combinar dashboards" (admin-only)**

Ache o bloco do botão "Novo dashboard" (linha 462-468):

```tsx
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-300/30 bg-white/[0.04] px-5 py-3 text-sm font-black text-cyan-100 transition-colors hover:border-cyan-300/50 hover:bg-white/[0.08]"
              >
                <Plus size={16} />
                Novo dashboard
              </button>
```

Troque por (adiciona o botão de combinar do lado, só quando `isAdmin`):

```tsx
              <div className="flex gap-2">
                {isAdmin && (
                  <button
                    onClick={() => { setEditingCombo(null); setComboModalOpen(true) }}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-300/30 bg-white/[0.04] px-5 py-3 text-sm font-black text-violet-200 transition-colors hover:border-violet-300/50 hover:bg-white/[0.08]"
                  >
                    <Layers size={16} />
                    Combinar dashboards
                  </button>
                )}
                <button
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-300/30 bg-white/[0.04] px-5 py-3 text-sm font-black text-cyan-100 transition-colors hover:border-cyan-300/50 hover:bg-white/[0.08]"
                >
                  <Plus size={16} />
                  Novo dashboard
                </button>
              </div>
```

- [ ] **Step 6: Adicionar a seção "Combinados"**

Ache o fechamento da seção "Todos os dashboards" e o início da seção seguinte (linha 594-596):

```tsx
          </section>

          <section className="mt-8 grid gap-4 lg:grid-cols-2">
```

Troque por (insere a nova seção entre as duas, só pra admin):

```tsx
          </section>

          {isAdmin && (
            <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
              <div>
                <h2 className="text-lg font-black">Combinados</h2>
                <p className="mt-1 text-sm text-slate-400">Faturamento e métricas de vários projetos somados numa tela só.</p>
              </div>

              {combos.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  Nenhuma combinação criada ainda — use o botão &quot;Combinar dashboards&quot; acima.
                </p>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {combos.map(combo => (
                    <div key={combo.id} className="rounded-2xl border border-white/10 bg-[#0b0d14] p-4">
                      <p className="font-bold">{combo.nome}</p>
                      <p className="mt-1 text-xs text-slate-500">{combo.projeto_ids.length} projeto(s)</p>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <Link
                          href={`/dashboard/combinado/${combo.id}`}
                          className="col-span-1 flex h-9 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 text-xs font-black text-white"
                        >
                          Abrir
                        </Link>
                        <button
                          onClick={() => { setEditingCombo(combo); setComboModalOpen(true) }}
                          className="flex h-9 items-center justify-center rounded-xl border border-white/10 text-xs font-bold text-slate-300 hover:text-white"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          onClick={() => setDeleteComboTarget(combo)}
                          className="flex h-9 items-center justify-center rounded-xl border border-white/10 text-xs font-bold text-slate-400 hover:border-red-300/35 hover:text-red-200"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="mt-8 grid gap-4 lg:grid-cols-2">
```

- [ ] **Step 7: Renderizar o modal e o diálogo de exclusão**

Antes do `</div>` final que fecha o componente (procure o fechamento depois do bloco `{deleteTarget && (...)}`, por volta da linha 879-882), adicione, imediatamente antes do `</div>` de fechamento do componente raiz:

```tsx
      {userId && (
        <CombineDashboardsModal
          open={comboModalOpen}
          onClose={() => setComboModalOpen(false)}
          projetos={dashboards}
          userId={userId}
          combo={editingCombo}
          onSaved={saved => {
            setCombos(prev => {
              const exists = prev.some(c => c.id === saved.id)
              return exists ? prev.map(c => (c.id === saved.id ? saved : c)) : [...prev, saved]
            })
            setComboModalOpen(false)
          }}
        />
      )}

      {deleteComboTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#0b0d14] p-6 shadow-2xl shadow-black/60">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-200">
              <Trash2 size={21} />
            </div>
            <h2 className="mt-5 text-xl font-black">Excluir esta combinação?</h2>
            <p className="mt-2 text-sm text-slate-500">
              &quot;{deleteComboTarget.nome}&quot; será removida. Isso não afeta os dashboards individuais.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setDeleteComboTarget(null)}
                disabled={deletingCombo}
                className="h-12 flex-1 rounded-2xl border border-white/10 text-sm font-black text-slate-300 transition-colors hover:text-white disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={deleteCombo}
                disabled={deletingCombo}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500 text-sm font-black text-white shadow-[0_0_28px_rgba(239,68,68,0.25)] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
              >
                {deletingCombo && <Loader2 size={16} className="animate-spin" />}
                Excluir combinação
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 8: Verificar**

```bash
npx tsc --noEmit
```
Esperado: nenhum erro.

- [ ] **Step 9: Verificação manual no navegador**

```bash
npm run dev
```
Abra `http://localhost:3000/dashboard` logado como admin. Confirme:
1. O botão "Combinar dashboards" aparece do lado de "Novo dashboard".
2. Clicar nele abre o modal, com a lista de dashboards existentes em checkbox.
3. Marcar 2+ projetos, dar um nome (ex: "Teste"), clicar "Criar combinação" — o modal fecha e a combinação aparece na nova seção "Combinados".
4. O botão de excluir (lixeira) no card do combinado abre a confirmação e remove o card ao confirmar.

- [ ] **Step 10: Commit**

```bash
git add components/saas/UserAppShell.tsx
git commit -m "feat: botão e seção Combinados em Meus Dashboards (admin-only)"
```

---

### Task 6: Rota `/dashboard/combinado/[id]` (tela do combinado)

**Files:**
- Create: `app/dashboard/combinado/[id]/page.tsx`
- Create: `app/dashboard/combinado/[id]/ComboClient.tsx`

**Interfaces:**
- Consumes: `fetchVendasSummary`, `fetchHotmartIdsForProjetos`, `SummaryRow` (Task 2, `lib/vendas-aggregation.ts`); `ComboMetricCards` (Task 3); `CombineDashboardsModal` (Task 4); `PeriodFilter`, `SalesTable` (já existentes); `getPeriodRange` (já existente, `lib/utils.ts`).
- Produces: página final visível ao usuário — não é consumida por nenhuma outra task.

- [ ] **Step 1: Criar o wrapper de rota**

`app/dashboard/combinado/[id]/page.tsx` — mesmo padrão de `app/dashboard/[id]/page.tsx` (params assíncrono do Next 15):

```tsx
import { ComboClient } from './ComboClient'

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ComboClient key={id} comboId={id} />
}
```

- [ ] **Step 2: Criar o componente cliente**

`app/dashboard/combinado/[id]/ComboClient.tsx`:

```tsx
'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getPeriodRange } from '@/lib/utils'
import { fetchVendasSummary, fetchHotmartIdsForProjetos, type SummaryRow } from '@/lib/vendas-aggregation'
import type { DashboardCombo, Projeto, Venda, Period } from '@/lib/types'
import { PeriodFilter } from '@/components/dashboard/PeriodFilter'
import { SalesTable } from '@/components/dashboard/SalesTable'
import { ComboMetricCards } from '@/components/saas/ComboMetricCards'
import { CombineDashboardsModal } from '@/components/saas/CombineDashboardsModal'
import { Spinner } from '@/components/ui/Spinner'

export function ComboClient({ comboId }: { comboId: string }) {
  const router = useRouter()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [combo, setCombo] = useState<DashboardCombo | null>(null)
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [allProjetos, setAllProjetos] = useState<Projeto[]>([])
  const [notFound, setNotFound] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [period, setPeriod] = useState<Period>('thisMonth')
  const [customFrom, setCustomFrom] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [customTo, setCustomTo] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })
  const [exchangeRate, setExchangeRate] = useState(5.0)
  const [summary, setSummary] = useState<SummaryRow[]>([])
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [summaryError, setSummaryError] = useState(false)
  const [vendas, setVendas] = useState<Venda[]>([])
  const [loadingVendas, setLoadingVendas] = useState(true)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)

  const summaryAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    async function checkAccessAndLoad() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (profile?.role !== 'admin') { router.push('/dashboard'); return }

      const { data: comboRow, error: comboError } = await supabase
        .from('dashboard_combos')
        .select('*')
        .eq('id', comboId)
        .maybeSingle()
      if (comboError || !comboRow) { setNotFound(true); setAllowed(true); return }

      const comboData = comboRow as DashboardCombo
      setCombo(comboData)

      const { data: allProjetosData } = await supabase.from('projetos').select('*').order('nome')
      setAllProjetos((allProjetosData ?? []) as Projeto[])

      if (comboData.projeto_ids.length > 0) {
        const { data: projetosData } = await supabase
          .from('projetos')
          .select('*')
          .in('id', comboData.projeto_ids)
        setProjetos((projetosData ?? []) as Projeto[])
      }

      setAllowed(true)
    }
    void checkAccessAndLoad()
  }, [comboId, router])

  const customDateRange = useMemo(() => {
    if (period !== 'custom') return undefined
    const parseLocal = (s: string) => {
      const [y, m, d] = s.split('-').map(Number)
      return new Date(y!, m! - 1, d!)
    }
    return {
      from: parseLocal(customFrom),
      to: new Date(parseLocal(customTo).getTime() + 86_400_000),
    }
  }, [period, customFrom, customTo])

  useEffect(() => {
    const toLocalDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const { from, to } = getPeriodRange(period, customDateRange)
    const fromStr = toLocalDate(from)
    const toStr = toLocalDate(new Date(to.getTime() - 1))
    fetch(`/api/exchange-rate?from=${fromStr}&to=${toStr}`)
      .then(r => r.json())
      .then((d: { rate: number }) => setExchangeRate(d.rate ?? 5.0))
      .catch(() => {})
  }, [period, customDateRange])

  const fetchAll = useCallback(async () => {
    if (!combo || combo.projeto_ids.length === 0) {
      setSummary([])
      setVendas([])
      setLoadingSummary(false)
      setLoadingVendas(false)
      return
    }

    summaryAbortRef.current?.abort()
    const controller = new AbortController()
    summaryAbortRef.current = controller

    const { from, to } = getPeriodRange(period, customDateRange)

    setLoadingSummary(true)
    setSummaryError(false)
    try {
      const results = await Promise.all(
        combo.projeto_ids.map(id => fetchVendasSummary(id, from, to, controller.signal)),
      )
      if (controller.signal.aborted) return
      setSummary(results.flat())
    } catch {
      if (!controller.signal.aborted) setSummaryError(true)
    } finally {
      if (!controller.signal.aborted) setLoadingSummary(false)
    }

    setLoadingVendas(true)
    try {
      const hotmartIds = await fetchHotmartIdsForProjetos(combo.projeto_ids)
      if (hotmartIds.length === 0) {
        setVendas([])
      } else {
        const { data } = await supabase
          .from('vendas')
          .select('*')
          .in('hotmart_produto_id', hotmartIds)
          .gte('data_venda', from.toISOString())
          .lt('data_venda', to.toISOString())
          .order('data_venda', { ascending: false })
        setVendas((data ?? []) as Venda[])
      }
    } finally {
      setLoadingVendas(false)
      setLastUpdatedAt(new Date())
    }
  }, [combo, period, customDateRange])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  async function deleteCombo() {
    if (!combo) return
    setDeleting(true)
    const { error } = await supabase.from('dashboard_combos').delete().eq('id', combo.id)
    setDeleting(false)
    if (!error) router.push('/dashboard')
  }

  if (allowed !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07080d]">
        <Spinner size={28} />
      </div>
    )
  }

  if (notFound || !combo) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#07080d] text-white">
        <p className="text-sm text-slate-400">Combinação não encontrada.</p>
        <Link href="/dashboard" className="text-sm font-bold text-cyan-300">Voltar pra Meus Dashboards</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#07080d] text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07080d]/80 px-4 py-4 backdrop-blur-2xl sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 text-slate-400 hover:text-white">
              <ArrowLeft size={17} />
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">Combinado</p>
              <h1 className="mt-1 text-xl font-black sm:text-2xl">{combo.nome}</h1>
              <p className="mt-0.5 text-xs text-slate-500">{projetos.map(p => p.nome).join(' + ')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowEdit(true)} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 text-slate-300 hover:text-white" title="Editar">
              <Pencil size={16} />
            </button>
            <button onClick={() => setShowDeleteConfirm(true)} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 text-slate-400 hover:border-red-300/35 hover:text-red-200" title="Excluir">
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 sm:px-6 sm:py-8">
        <PeriodFilter
          value={period}
          onChange={setPeriod}
          customFrom={customFrom}
          customTo={customTo}
          updatedAt={lastUpdatedAt}
          onCustomChange={(from, to) => { setCustomFrom(from); setCustomTo(to) }}
        />

        {summaryError ? (
          <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            Não foi possível carregar as métricas combinadas.{' '}
            <button onClick={() => void fetchAll()} className="font-bold underline">Tentar de novo</button>
          </div>
        ) : loadingSummary ? (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/[0.035]" />)}
          </div>
        ) : (
          <div className="mt-6">
            <ComboMetricCards summary={summary} exchangeRate={exchangeRate} />
          </div>
        )}

        <div className="mt-10">
          <h2 className="mb-4 text-lg font-black">Transações</h2>
          {loadingVendas ? (
            <div className="flex h-40 items-center justify-center">
              <Spinner size={24} />
            </div>
          ) : (
            <SalesTable vendas={vendas} exchangeRate={exchangeRate} initialStatusFilter="all" />
          )}
        </div>
      </main>

      {userId && (
        <CombineDashboardsModal
          open={showEdit}
          onClose={() => setShowEdit(false)}
          projetos={allProjetos}
          userId={userId}
          combo={combo}
          onSaved={updated => {
            setCombo(updated)
            setShowEdit(false)
            supabase.from('projetos').select('*').in('id', updated.projeto_ids).then(({ data }) => {
              setProjetos((data ?? []) as Projeto[])
            })
          }}
        />
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#0b0d14] p-6 shadow-2xl shadow-black/60">
            <h2 className="text-xl font-black">Excluir esta combinação?</h2>
            <p className="mt-2 text-sm text-slate-500">Isso não afeta os dashboards individuais, só remove o combinado &quot;{combo.nome}&quot;.</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting} className="h-12 flex-1 rounded-2xl border border-white/10 text-sm font-black text-slate-300 hover:text-white disabled:opacity-60">
                Cancelar
              </button>
              <button onClick={deleteCombo} disabled={deleting} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500 text-sm font-black text-white disabled:opacity-60">
                {deleting && <Loader2 size={16} className="animate-spin" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit
```
Esperado: nenhum erro.

- [ ] **Step 4: Verificação manual no navegador**

Com `npm run dev` já rodando, na combinação criada na Task 5 (Step 9), clique em "Abrir". Confirme:
1. A tela carrega com o filtro de período, os cards de totais e a aba de transações.
2. Trocar o período (ex: "Último mês") atualiza os cards e a tabela.
3. Os números dos cards fazem sentido como soma dos projetos selecionados (compare rapidamente "Total Convertido" desta tela com a soma manual dos dashboards individuais dos mesmos projetos, no mesmo período).
4. O botão de editar (lápis) abre o modal com os projetos certos pré-marcados; desmarcar um e salvar atualiza a lista de projetos exibida no topo e refaz os cálculos.
5. O botão de excluir (lixeira) remove a combinação e volta pra "Meus Dashboards".

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/combinado
git commit -m "feat: tela /dashboard/combinado/[id] (totais + transações combinadas)"
```

---

## Verificação final

1. `npx tsc --noEmit` sem erros (deve já estar limpo desde a Task 6, mas confirme de novo depois de todos os commits).
2. Fluxo completo no navegador: criar combinação com 2-3 projetos reais (ex: os dashboards IT/FR/ES mencionados pelo usuário) → abrir → trocar período → editar → excluir.
3. Confirmar que um usuário **não-admin** não vê o botão "Combinar dashboards" nem a seção "Combinados" em `/dashboard`, e que acessar `/dashboard/combinado/<id-de-uma-combinação-existente>` direto pela URL redireciona pra `/dashboard` (checar com uma conta não-admin, se disponível).
4. Depois de tudo validado, dar `git push`.
