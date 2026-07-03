# Acesso restrito "Gestor de Tráfego" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the project owner invite a "Gestor de Tráfego" (e.g. Pedro) to one project with read-only, date-limited access — no Vendas tab, no Admin, no project switching, no WhatsApp/Meta credentials — while fixing two pre-existing security gaps (RLS not honoring shared permissions; WhatsApp tokens readable by any logged-in user) that would otherwise block or undermine this feature.

**Architecture:** Reuses the existing `user_dashboard_permissions` table (per `user_id` + `projeto_id`), adding four columns (`pode_ver_vendas`, `pode_adicionar_custo_manual`, `pode_ver_conexao_whatsapp`, `dados_visiveis_a_partir`). A new Postgres RLS migration makes these columns the actual enforcement layer (defense in depth — not just hidden UI). App code adds a permission-aware guard to the pages/components that need to change, following the existing pattern already used in `DashboardClient.tsx` (fetch `user_dashboard_permissions`, branch on it).

**Tech Stack:** Next.js App Router (client components, no middleware — existing pattern), Supabase (Postgres RLS, `@supabase/ssr` browser client), TypeScript.

## Global Constraints

- No automated test suite exists in this repo (`package.json` has no `test` script). Verification is: `npx tsc --noEmit` (types), `npm run lint`, and manual QA in the browser with a real second Supabase user — do not claim "tests pass" for this project.
- Migrations are plain `.sql` files under `migrations/`, applied manually by the project owner in the Supabase SQL Editor — there is no migration runner in this codebase. Do not attempt to execute SQL against production yourself.
- Follow the existing pattern: no `middleware.ts`, no server-side session gate. Auth/permission checks happen client-side in a `useEffect`, same as `DashboardClient.tsx:955-981` and `app/projects/page.tsx:56-76`.
- Keep all new Portuguese-language labels consistent with existing UI copy style (e.g. "Visualizar", "Editar layout").
- Never introduce a new secret into a client component (`'use client'` file) or a `NEXT_PUBLIC_*` env var.

---

### Task 1: Migration — permission columns + RLS enforcement

**Files:**
- Create: `migrations/036_gestor_trafego_permissions.sql`

**Interfaces:**
- Produces: four new columns on `public.user_dashboard_permissions`: `pode_ver_vendas boolean`, `pode_adicionar_custo_manual boolean`, `pode_ver_conexao_whatsapp boolean`, `dados_visiveis_a_partir date`. All later tasks that read/write permissions use exactly these column names.

- [ ] **Step 1: Write the migration SQL**

```sql
-- Migration 036: permissões do "Gestor de Tráfego" + correções de RLS
-- Contexto: user_dashboard_permissions existia mas não era respeitada pelas
-- policies de RLS (só o dono do projeto tinha acesso). Esta migration:
--   1. adiciona as colunas novas de permissão;
--   2. adiciona policies extras (somativas, não substituem as existentes)
--      para liberar acesso a quem tem uma linha em user_dashboard_permissions;
--   3. fecha o acesso público a whatsapp_connections (tokens de API).

-- ─── Novas colunas ──────────────────────────────────────────────────────────

ALTER TABLE public.user_dashboard_permissions
  ADD COLUMN IF NOT EXISTS pode_ver_vendas boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pode_adicionar_custo_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pode_ver_conexao_whatsapp boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dados_visiveis_a_partir date;

-- ─── projetos: liberar SELECT para quem tem permissão compartilhada ────────

CREATE POLICY "shared users select projetos"
  ON public.projetos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = projetos.id
        AND udp.user_id = auth.uid()
        AND udp.pode_visualizar = true
    )
  );

-- ─── produtos: liberar SELECT para quem tem permissão compartilhada ────────

CREATE POLICY "shared users select produtos"
  ON public.produtos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projeto_produtos pp
      JOIN public.user_dashboard_permissions udp ON udp.projeto_id = pp.projeto_id
      WHERE pp.produto_id = produtos.id
        AND udp.user_id = auth.uid()
        AND udp.pode_visualizar = true
    )
  );

-- ─── projeto_produtos / projeto_produto_ofertas: SELECT para viewers ───────

CREATE POLICY "shared users select projeto_produtos"
  ON public.projeto_produtos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = projeto_produtos.projeto_id
        AND udp.user_id = auth.uid()
        AND udp.pode_visualizar = true
    )
  );

CREATE POLICY "shared users select projeto_produto_ofertas"
  ON public.projeto_produto_ofertas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = projeto_produto_ofertas.projeto_id
        AND udp.user_id = auth.uid()
        AND udp.pode_visualizar = true
    )
  );

-- ─── vendas: SELECT para viewers, com corte de data ────────────────────────

CREATE POLICY "shared users select vendas"
  ON public.vendas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.projeto_produtos pp ON pp.produto_id = p.id
      JOIN public.user_dashboard_permissions udp ON udp.projeto_id = pp.projeto_id
      WHERE p.hotmart_id = vendas.hotmart_produto_id
        AND udp.user_id = auth.uid()
        AND udp.pode_visualizar = true
        AND (
          udp.dados_visiveis_a_partir IS NULL
          OR vendas.data_venda >= udp.dados_visiveis_a_partir
        )
    )
  );

-- ─── custos_manuais: SELECT com corte de data + INSERT dedicado ───────────

CREATE POLICY "shared users select custos_manuais"
  ON public.custos_manuais FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = custos_manuais.projeto_id
        AND udp.user_id = auth.uid()
        AND udp.pode_visualizar = true
        AND (
          udp.dados_visiveis_a_partir IS NULL
          OR custos_manuais.data >= udp.dados_visiveis_a_partir
        )
    )
  );

CREATE POLICY "shared users insert custos_manuais"
  ON public.custos_manuais FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = custos_manuais.projeto_id
        AND udp.user_id = auth.uid()
        AND udp.pode_adicionar_custo_manual = true
    )
  );

-- ─── dashboard_widgets: SELECT para viewers, escrita para editores ─────────

CREATE POLICY "shared users select dashboard_widgets"
  ON public.dashboard_widgets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = dashboard_widgets.projeto_id
        AND udp.user_id = auth.uid()
        AND udp.pode_visualizar = true
    )
  );

CREATE POLICY "shared users edit dashboard_widgets"
  ON public.dashboard_widgets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = dashboard_widgets.projeto_id
        AND udp.user_id = auth.uid()
        AND (udp.pode_editar_layout = true OR udp.pode_adicionar_widgets = true OR udp.is_admin_dashboard = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = dashboard_widgets.projeto_id
        AND udp.user_id = auth.uid()
        AND (udp.pode_editar_layout = true OR udp.pode_adicionar_widgets = true OR udp.is_admin_dashboard = true)
    )
  );

-- ─── whatsapp_report_schedules: viewers podem configurar relatórios ────────

CREATE POLICY "shared users manage whatsapp_report_schedules"
  ON public.whatsapp_report_schedules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = whatsapp_report_schedules.projeto_id
        AND udp.user_id = auth.uid()
        AND udp.pode_visualizar = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = whatsapp_report_schedules.projeto_id
        AND udp.user_id = auth.uid()
        AND udp.pode_visualizar = true
    )
  );

-- ─── whatsapp_connections: fecha para "qualquer autenticado", abre só admin ─
-- Achado de segurança: hoje qualquer usuário logado lê access_token e
-- evolution_api_key de TODOS os projetos. Corrige para: só admin (dono).
-- A tela de Relatórios do gestor nunca lê esta tabela diretamente — usa a
-- rota /api/relatorios/connection-id (service role) para obter só o ID.

DROP POLICY IF EXISTS "authenticated users access whatsapp_connections" ON public.whatsapp_connections;

CREATE POLICY "admin manages whatsapp_connections"
  ON public.whatsapp_connections FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
  );
```

- [ ] **Step 2: Sanity-check the SQL for typos/balanced parens**

Run (from the repo root, no DB connection needed — just a syntax sanity check):

```bash
node -e "const fs=require('fs');const s=fs.readFileSync('migrations/036_gestor_trafego_permissions.sql','utf8');const opens=(s.match(/\(/g)||[]).length;const closes=(s.match(/\)/g)||[]).length;console.log('opens:',opens,'closes:',closes);if(opens!==closes)process.exit(1)"
```

Expected: `opens:` and `closes:` print the same number, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add migrations/036_gestor_trafego_permissions.sql
git commit -m "feat: adiciona permissões de Gestor de Tráfego e corrige RLS de acesso compartilhado"
```

> **Note for the human running this plan:** this SQL file must be pasted into the Supabase SQL Editor and run manually before Task 7's manual QA — nothing in this codebase applies migrations automatically. This is called out again in Task 10.

> **Audit note (result of the "revisão geral" the spec asked for):** every table created via a migration file has `ENABLE ROW LEVEL SECURITY`, and a full-text search of `migrations/*.sql` for `USING (true)` / `allow_all_*` policies found exactly three historically-permissive policies: `dashboard_widgets` and `whatsapp_report_schedules` (already fixed for ownership in migration `033`) and `whatsapp_connections` (fixed by this migration, above). No other permissive-by-default policy exists in the migration history.

---

### Task 2: Extend the invite/permissions UI in `app/admin/page.tsx`

**Files:**
- Modify: `app/admin/page.tsx:16-50` (types + constants), `:60-153` (`PermissionsProjectList`), invite form section (search `showInvite` for the JSX block, currently around line 520-545)

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `PermRow` type now includes `pode_ver_vendas`, `pode_adicionar_custo_manual`, `pode_ver_conexao_whatsapp`, `dados_visiveis_a_partir` — Task 3's API routes read these exact field names off the object the UI sends.

- [ ] **Step 1: Extend the `PermRow` type and defaults**

In `app/admin/page.tsx`, replace lines 21-41:

```ts
type PermRow = {
  pode_visualizar: boolean
  pode_editar_layout: boolean
  pode_adicionar_widgets: boolean
  pode_configurar_produtos: boolean
  pode_ver_produtos_ofertas: boolean
  pode_excluir_dashboard: boolean
  pode_ver_vendas: boolean
  pode_adicionar_custo_manual: boolean
  pode_ver_conexao_whatsapp: boolean
  is_admin_dashboard: boolean
  dados_visiveis_a_partir: string | null
}

type StoredPerm = PermRow & { projeto_id: string }

const DEFAULT_PERM: PermRow = {
  pode_visualizar: true,
  pode_editar_layout: false,
  pode_adicionar_widgets: false,
  pode_configurar_produtos: false,
  pode_ver_produtos_ofertas: true,
  pode_excluir_dashboard: false,
  pode_ver_vendas: false,
  pode_adicionar_custo_manual: false,
  pode_ver_conexao_whatsapp: false,
  is_admin_dashboard: false,
  dados_visiveis_a_partir: null,
}

const GESTOR_TRAFEGO_PERM: Omit<PermRow, 'dados_visiveis_a_partir'> = {
  pode_visualizar: true,
  pode_editar_layout: false,
  pode_adicionar_widgets: false,
  pode_configurar_produtos: false,
  pode_ver_produtos_ofertas: false,
  pode_excluir_dashboard: false,
  pode_ver_vendas: false,
  pode_adicionar_custo_manual: true,
  pode_ver_conexao_whatsapp: false,
  is_admin_dashboard: false,
}

const PERM_KEYS: { key: keyof Omit<PermRow, 'is_admin_dashboard' | 'dados_visiveis_a_partir'>; label: string }[] = [
  { key: 'pode_visualizar', label: 'Visualizar' },
  { key: 'pode_editar_layout', label: 'Editar layout' },
  { key: 'pode_adicionar_widgets', label: 'Adicionar widgets' },
  { key: 'pode_configurar_produtos', label: 'Configurar produtos' },
  { key: 'pode_ver_produtos_ofertas', label: 'Ver produtos e ofertas' },
  { key: 'pode_excluir_dashboard', label: 'Excluir dashboard' },
  { key: 'pode_ver_vendas', label: 'Ver aba Vendas' },
  { key: 'pode_adicionar_custo_manual', label: 'Adicionar custo manual' },
  { key: 'pode_ver_conexao_whatsapp', label: 'Ver conexão WhatsApp' },
]
```

- [ ] **Step 2: Add a "Gestor de Tráfego" preset button and date-cutoff field to `PermissionsProjectList`**

Replace the function signature and the per-project checkbox block (lines 60-153) so it accepts an `onApplyPreset` callback and a date input bound to `dados_visiveis_a_partir`:

```tsx
function PermissionsProjectList({
  projetos,
  perms,
  onToggle,
  onSetPerm,
  onApplyPreset,
  onSetDate,
}: {
  projetos: Projeto[]
  perms: Record<string, PermRow>
  onToggle: (id: string, checked: boolean) => void
  onSetPerm: (id: string, key: keyof PermRow, value: boolean) => void
  onApplyPreset: (id: string) => void
  onSetDate: (id: string, value: string) => void
}) {
  if (projetos.length === 0) {
    return <p className="py-6 text-center text-xs text-slate-500">Nenhum projeto criado ainda.</p>
  }

  return (
    <div className="space-y-2">
      {projetos.map(projeto => {
        const hasAccess = !!perms[projeto.id]
        const perm = perms[projeto.id]
        return (
          <div
            key={projeto.id}
            className={`overflow-hidden rounded-2xl border transition-all ${
              hasAccess ? 'border-cyan-400/25 bg-cyan-400/[0.04]' : 'border-white/8 bg-white/[0.02]'
            }`}
          >
            <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                  hasAccess ? 'border-cyan-400 bg-cyan-400/20' : 'border-white/15'
                }`}
              >
                {hasAccess && <Check size={11} className="text-cyan-400" />}
              </span>
              <span className="flex flex-1 items-center gap-2 text-sm font-medium text-slate-200">
                <LayoutDashboard size={13} className="shrink-0 text-slate-500" />
                {projeto.nome}
              </span>
              <input
                type="checkbox"
                className="sr-only"
                checked={hasAccess}
                onChange={e => onToggle(projeto.id, e.target.checked)}
              />
            </label>

            {hasAccess && perm && (
              <div className="border-t border-white/8 px-4 pb-3 pt-2.5">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onApplyPreset(projeto.id)}
                    className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1.5 text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-400/20"
                  >
                    Gestor de Tráfego (preset seguro)
                  </button>
                  <label className="flex items-center gap-1.5 text-xs text-slate-400">
                    Só ver dados a partir de:
                    <input
                      type="date"
                      value={perm.dados_visiveis_a_partir ?? ''}
                      onChange={e => onSetDate(projeto.id, e.target.value)}
                      className="rounded-lg border border-white/10 bg-[#121221] px-2 py-1 text-xs text-slate-200 outline-none focus:border-indigo-500/60"
                    />
                  </label>
                </div>

                <label className="mb-2.5 flex cursor-pointer items-center gap-2">
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      perm.is_admin_dashboard ? 'border-violet-400 bg-violet-400/20' : 'border-white/15'
                    }`}
                  >
                    {perm.is_admin_dashboard && <Check size={10} className="text-violet-400" />}
                  </span>
                  <span className="text-xs font-bold text-violet-300">Admin total (marca tudo)</span>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={perm.is_admin_dashboard}
                    onChange={e => onSetPerm(projeto.id, 'is_admin_dashboard', e.target.checked)}
                  />
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {PERM_KEYS.map(({ key, label }) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2">
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                          perm[key] ? 'border-cyan-400 bg-cyan-400/20' : 'border-white/15'
                        }`}
                      >
                        {perm[key] && <Check size={10} className="text-cyan-400" />}
                      </span>
                      <span className="text-xs text-slate-400">{label}</span>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={perm[key] as boolean}
                        onChange={e => onSetPerm(projeto.id, key, e.target.checked)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Wire the new callbacks where `PermissionsProjectList` is used**

Find both call sites of `<PermissionsProjectList ... />` (the invite form and the edit-permissions modal — search `handleToggleProject` and `handleSetPerm` for the two usages). For each, add the two new props next to the existing `onToggle`/`onSetPerm`:

```tsx
onApplyPreset={(id) =>
  setInvitePerms(prev => ({ ...prev, [id]: { ...GESTOR_TRAFEGO_PERM, dados_visiveis_a_partir: prev[id]?.dados_visiveis_a_partir ?? null } }))
}
onSetDate={(id, value) =>
  setInvitePerms(prev => ({ ...prev, [id]: { ...(prev[id] ?? DEFAULT_PERM), dados_visiveis_a_partir: value || null } }))
}
```

(For the edit-permissions modal call site, use `setEditPerms` instead of `setInvitePerms` — same shape.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `app/admin/page.tsx`.

- [ ] **Step 5: Commit**

```bash
git add app/admin/page.tsx
git commit -m "feat: preset Gestor de Tráfego e data de corte na tela de convite"
```

---

### Task 3: Persist the new fields through the invite/permissions API routes

**Files:**
- Modify: `app/api/admin/invite/route.ts:5-14,84-97`
- Modify: `app/api/admin/permissions/route.ts:5-14,69-82`

**Interfaces:**
- Consumes: `PermRow`-shaped objects from Task 2's UI (`pode_ver_vendas`, `pode_adicionar_custo_manual`, `pode_ver_conexao_whatsapp`, `dados_visiveis_a_partir`).

- [ ] **Step 1: Extend `InvitePermission` and the insert payload in `app/api/admin/invite/route.ts`**

Replace lines 5-14:

```ts
type InvitePermission = {
  projeto_id: string
  pode_visualizar?: boolean
  pode_editar_layout?: boolean
  pode_adicionar_widgets?: boolean
  pode_configurar_produtos?: boolean
  pode_ver_produtos_ofertas?: boolean
  pode_excluir_dashboard?: boolean
  pode_ver_vendas?: boolean
  pode_adicionar_custo_manual?: boolean
  pode_ver_conexao_whatsapp?: boolean
  is_admin_dashboard?: boolean
  dados_visiveis_a_partir?: string | null
}
```

Replace lines 84-97 (the `rows` mapping):

```ts
  if (permissoes && permissoes.length > 0 && inviteData?.user?.id) {
    const rows = permissoes.map(p => ({
      user_id: inviteData.user.id,
      projeto_id: p.projeto_id,
      pode_visualizar: p.pode_visualizar ?? true,
      pode_editar_layout: p.pode_editar_layout ?? false,
      pode_adicionar_widgets: p.pode_adicionar_widgets ?? false,
      pode_configurar_produtos: p.pode_configurar_produtos ?? false,
      pode_ver_produtos_ofertas: p.pode_ver_produtos_ofertas ?? false,
      pode_excluir_dashboard: p.pode_excluir_dashboard ?? false,
      pode_ver_vendas: p.pode_ver_vendas ?? false,
      pode_adicionar_custo_manual: p.pode_adicionar_custo_manual ?? false,
      pode_ver_conexao_whatsapp: p.pode_ver_conexao_whatsapp ?? false,
      is_admin_dashboard: p.is_admin_dashboard ?? false,
      dados_visiveis_a_partir: p.dados_visiveis_a_partir ?? null,
    }))
    await admin.from('user_dashboard_permissions').insert(rows)
  }
```

- [ ] **Step 2: Apply the same change to `app/api/admin/permissions/route.ts`**

Replace lines 5-14 with the same `PermissionInput` shape as `InvitePermission` above (rename the type name only, keep `PermissionInput`), and replace lines 69-82 (the `rows` mapping in `POST`) with the same additional fields as Step 1.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors in either route file.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/invite/route.ts app/api/admin/permissions/route.ts
git commit -m "feat: persiste novas permissões de gestor nas rotas de convite"
```

---

### Task 4: Hide "Vendas" and "Integrações" from the Sidebar for restricted users

**Files:**
- Modify: `components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `user_dashboard_permissions.pode_ver_vendas` (Task 1's column).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Fetch the user's permission rows and compute visibility flags**

In `components/layout/Sidebar.tsx`, replace the `useEffect` at lines 37-55:

```tsx
  const [canSeeVendas, setCanSeeVendas] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      supabase
        .from('configuracoes')
        .select('nome_empresa')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.nome_empresa) setCompanyName(data.nome_empresa as string)
        })
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      const admin = profile?.role === 'admin'
      if (admin) { setIsAdmin(true); setCanSeeVendas(true); return }
      const { data: perms } = await supabase
        .from('user_dashboard_permissions')
        .select('pode_ver_vendas')
        .eq('user_id', user.id)
        .eq('pode_ver_vendas', true)
        .limit(1)
      setCanSeeVendas((perms ?? []).length > 0)
    })
  }, [])
```

- [ ] **Step 2: Filter `NAV_ITEMS` before rendering**

Replace the `NAV_ITEMS.map` line (line 93) with a filtered list computed just above the `return` statement:

```tsx
  const visibleNavItems = NAV_ITEMS.filter(item => {
    if (item.href === '/vendas') return isAdmin || canSeeVendas
    if (item.href === '/integracoes') return isAdmin
    return true
  })
```

Then change `{NAV_ITEMS.map(item => {` to `{visibleNavItems.map(item => {`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors in `components/layout/Sidebar.tsx`.

- [ ] **Step 4: Commit**

```bash
git add components/layout/Sidebar.tsx
git commit -m "feat: esconde Vendas e Integrações do menu para usuários sem permissão"
```

---

### Task 5: Block direct navigation to `/vendas` for restricted users

**Files:**
- Modify: `app/vendas/page.tsx`

**Interfaces:**
- Consumes: same permission check pattern as Task 4 (independent fetch, since this is a different component/page).

- [ ] **Step 1: Add a permission-gate `useEffect` at the top of `VendasPage`**

In `app/vendas/page.tsx`, add the import and state, then the guard effect, right after the existing state declarations (after line 41):

```tsx
import { useRouter } from 'next/navigation'
// ... (add to existing imports from 'react'/'next/navigation')

export default function VendasPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  // ...existing state...

  useEffect(() => {
    async function checkAccess() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (profile?.role === 'admin') { setAllowed(true); return }
      const { data: perms } = await supabase
        .from('user_dashboard_permissions')
        .select('pode_ver_vendas')
        .eq('user_id', user.id)
        .eq('pode_ver_vendas', true)
        .limit(1)
      if ((perms ?? []).length === 0) { router.push('/projects'); return }
      setAllowed(true)
    }
    void checkAccess()
  }, [router])
```

- [ ] **Step 2: Don't render the page content until the check resolves**

Wrap the existing `return (...)` JSX: before it, add

```tsx
  if (allowed !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size={28} />
      </div>
    )
  }
```

(`Spinner` is already imported in this file.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors in `app/vendas/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add app/vendas/page.tsx
git commit -m "feat: bloqueia acesso direto a /vendas sem permissão"
```

---

### Task 6: Gate "Inserir custo" in the dashboard + remove data-leaking debug logs

**Files:**
- Modify: `app/dashboard/[id]/DashboardClient.tsx`

**Interfaces:**
- Consumes: `UserPerms` type (already defined at line 83-91) — extend it with the new columns so `userPerms?.pode_adicionar_custo_manual` type-checks.

- [ ] **Step 1: Extend the `UserPerms` type**

Replace lines 83-91:

```ts
type UserPerms = {
  pode_visualizar: boolean
  pode_editar_layout: boolean
  pode_adicionar_widgets: boolean
  pode_configurar_produtos: boolean
  pode_ver_produtos_ofertas: boolean
  pode_excluir_dashboard: boolean
  pode_ver_vendas: boolean
  pode_adicionar_custo_manual: boolean
  pode_ver_conexao_whatsapp: boolean
  is_admin_dashboard: boolean
  dados_visiveis_a_partir: string | null
} | null
```

- [ ] **Step 2: Add `canAddCustoManual` next to the other derived permission flags**

At line 1489-1492, add one line after `canEditLayout`:

```ts
  const canEditLayout = isAdmin || userPerms?.is_admin_dashboard || userPerms?.pode_editar_layout || false
  const canAddCustoManual = isAdmin || userPerms?.is_admin_dashboard || userPerms?.pode_adicionar_custo_manual || false
  const canAddWidgets = isAdmin || userPerms?.is_admin_dashboard || userPerms?.pode_adicionar_widgets || false
```

- [ ] **Step 3: Gate the "Inserir custo" button**

At line 1934, change:

```tsx
            {!editMode && (
```

to:

```tsx
            {!editMode && canAddCustoManual && (
```

(This is the button block ending at line 1948 that opens `showCustoModal`.)

- [ ] **Step 4: Remove the debug `console.log` calls that print sales data**

Delete these lines entirely (they print sale counts/dates/filters to the browser console in production):
- Line 676: `console.log('[DEBUG] projeto_produtos retornou:'...)`
- Line 677: `console.log('[DEBUG] productLinks todas_ofertas:'...)`
- Line 709: `console.log('[DEBUG] período atual from:'...)`
- Lines 746-747: the two `console.log('[DEBUG] currentData:'...)` / `console.log('[DEBUG] offerLinks:'...)` calls
- Line 1500: `console.log('[AFILIADO FILTER] selecionados:'...)`
- Lines 1502-1504: the `console.log('[ORIGEM FILTER]'...)` block

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors in `app/dashboard/[id]/DashboardClient.tsx`.

- [ ] **Step 6: Commit**

```bash
git add "app/dashboard/[id]/DashboardClient.tsx"
git commit -m "feat: restringe inserir custo manual por permissão e remove logs de depuração"
```

---

### Task 7: New API route — hand out a WhatsApp connection id without exposing tokens

**Files:**
- Create: `app/api/relatorios/connection-id/route.ts`

**Interfaces:**
- Consumes: `getAuthenticatedUser` from `app/api/meta/_utils.ts` (existing helper, returns `{ supabase, user }` bound to the caller's session).
- Produces: `GET /api/relatorios/connection-id?projeto_id=<uuid>` → `{ connectionId: string | null }`. Task 8 calls this exact endpoint/shape.

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '../../meta/_utils'

function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function GET(request: Request) {
  const { user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const projetoId = searchParams.get('projeto_id')
  if (!projetoId) return NextResponse.json({ error: 'projeto_id required' }, { status: 400 })

  const svc = getServiceClient()
  if (!svc) return NextResponse.json({ error: 'service key not configured' }, { status: 500 })

  const { data: profile } = await svc.from('user_profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = (profile as { role?: string } | null)?.role === 'admin'

  if (!isAdmin) {
    const { data: perm } = await svc
      .from('user_dashboard_permissions')
      .select('pode_visualizar')
      .eq('user_id', user.id)
      .eq('projeto_id', projetoId)
      .maybeSingle()
    if (!(perm as { pode_visualizar?: boolean } | null)?.pode_visualizar) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
  }

  const { data: schedule } = await svc
    .from('whatsapp_report_schedules')
    .select('whatsapp_connection_id')
    .eq('projeto_id', projetoId)
    .not('whatsapp_connection_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let connectionId = (schedule as { whatsapp_connection_id?: string } | null)?.whatsapp_connection_id ?? null

  if (!connectionId) {
    const { data: firstConnection } = await svc
      .from('whatsapp_connections')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    connectionId = (firstConnection as { id?: string } | null)?.id ?? null
  }

  return NextResponse.json({ connectionId })
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors in `app/api/relatorios/connection-id/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/api/relatorios/connection-id/route.ts
git commit -m "feat: rota que resolve conexao de whatsapp sem expor token"
```

---

### Task 8: Relatórios page — scope the project list and hide the WhatsApp panel for restricted users

**Files:**
- Modify: `app/relatorios/page.tsx`

**Interfaces:**
- Consumes: `GET /api/relatorios/connection-id?projeto_id=` from Task 7, returning `{ connectionId: string | null }`.

- [ ] **Step 1: Load the caller's role/permissions and compute `canSeeConnection` + allowed project ids**

Add state and a new effect near the top of `RelatoriosPage` (after the existing `useState` declarations, before `loadBase`):

```tsx
  const [isAdmin, setIsAdmin] = useState(false)
  const [allowedProjetoIds, setAllowedProjetoIds] = useState<Set<string> | null>(null)
  const [canSeeConnection, setCanSeeConnection] = useState(false)

  useEffect(() => {
    async function loadAccess() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      const admin = profile?.role === 'admin'
      setIsAdmin(admin)
      if (admin) { setCanSeeConnection(true); return }
      const { data: perms } = await supabase
        .from('user_dashboard_permissions')
        .select('projeto_id, pode_ver_conexao_whatsapp')
        .eq('user_id', user.id)
        .eq('pode_visualizar', true)
      const rows = (perms ?? []) as { projeto_id: string; pode_ver_conexao_whatsapp: boolean }[]
      setAllowedProjetoIds(new Set(rows.map(r => r.projeto_id)))
      setCanSeeConnection(rows.some(r => r.pode_ver_conexao_whatsapp))
    }
    void loadAccess()
  }, [])
```

- [ ] **Step 2: Filter the project dropdown to allowed projects**

In `loadBase` (around line 349), after `const projectRows = (projectsRes.data ?? []) as Projeto[]`, the query already goes through RLS (Task 1 fixed this), so non-admins already only receive their permitted rows from Supabase directly — no client-side filtering needed here. Leave `loadBase` unchanged.

- [ ] **Step 3: Hide the WhatsApp accordion and auto-resolve the connection id when `!canSeeConnection`**

Replace the accordion's opening condition. Find:

```tsx
              {/* ── Accordion WhatsApp ── */}
              <div className="mb-3 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[#151525] shadow-2xl shadow-black/20">
```

Wrap the entire accordion block (from this line through its matching closing `</div>` before `{/* ── 3-col body ── */}`) in `{canSeeConnection && ( ... )}`.

Then, add an effect that fetches the connection id for restricted users so scheduling/sending still works without ever rendering it:

```tsx
  useEffect(() => {
    if (canSeeConnection || !form.projeto_id) return
    fetch(`/api/relatorios/connection-id?projeto_id=${form.projeto_id}`)
      .then(r => r.json())
      .then((d: { connectionId: string | null }) => {
        if (d.connectionId) setForm(prev => ({ ...prev, whatsapp_connection_id: d.connectionId! }))
      })
      .catch(() => {})
  }, [canSeeConnection, form.projeto_id])
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors in `app/relatorios/page.tsx`.

- [ ] **Step 5: Commit**

```bash
git add app/relatorios/page.tsx
git commit -m "feat: esconde painel de conexao whatsapp de relatorios para usuarios sem permissao"
```

---

### Task 9: Sweep for remaining debug `console.log` calls that leak data

**Files:**
- Modify: `app/projects/page.tsx:184`
- Modify: any other file the grep in Step 1 finds

**Interfaces:** none — cleanup only.

- [ ] **Step 1: Find remaining data-leaking console.log calls in page/component code**

Run:

```bash
grep -rn "console\.log" app components --include="*.tsx" --include="*.ts" | grep -v "app/api/"
```

Expected: this lists `app/projects/page.tsx:184` (`console.log('[DRAG] started index:'...)`) and confirms Task 6 already removed the `DashboardClient.tsx` ones. Note any others found and remove them the same way as Step 2 below (server-side files under `app/api/` are excluded — those logs run on the server, not in the user's browser console, so they're not part of this exposure).

- [ ] **Step 2: Remove the console.log in `app/projects/page.tsx`**

Delete this line from the `onDragStart` handler (currently line 184):

```tsx
onDragStart={() => { console.log('[DRAG] started index:', i, 'projeto:', p.nome); setDragIndex(i) }}
```

Replace with:

```tsx
onDragStart={() => setDragIndex(i)}
```

Also remove the `console.log('[ADMIN] projetos carregados:', projetos)` at `app/admin/page.tsx:208` the same way (delete the line).

- [ ] **Step 3: Verify no more matches**

Run the Step 1 grep again.
Expected: no results outside `app/api/`.

- [ ] **Step 4: Commit**

```bash
git add app/projects/page.tsx app/admin/page.tsx
git commit -m "chore: remove logs de depuracao que vazam dados no console do navegador"
```

---

### Task 10: Manual QA — apply the migration and verify with a real second account

**Files:** none (verification only).

- [ ] **Step 1: Run the migration in Supabase**

Open the Supabase project's SQL Editor (dashboard.supabase.com → your project → SQL Editor), paste the full contents of `migrations/036_gestor_trafego_permissions.sql`, and run it. Expected: "Success. No rows returned."

- [ ] **Step 2: Build the app locally to catch any remaining type errors**

Run: `npm run build`
Expected: build completes with no type errors.

- [ ] **Step 3: Create the "TRÁFEGO - [PEDRO]" project and invite a real test account**

In `/admin`, create the project if not already created, then use "Convidar" with a second real email you control (not the owner's), click "Gestor de Tráfego (preset seguro)" on that project, set the cutoff date, and send the invite.

- [ ] **Step 4: Log in as the invited account and verify each restriction**

Accept the invite email, set a password, and log in as that user. Confirm:
- Sidebar shows Dashboards, Relatórios, Configurações — no Vendas, no Admin, no Integrações.
- `/projects` shows only the one assigned project.
- Opening the dashboard shows widgets with numbers matching only the period from the cutoff date onward.
- Inside the open dashboard, the project-switcher dropdown lists only the assigned project (no other projects leak through).
- Navigating directly to `/vendas` redirects away instead of showing the sales table.
- Navigating directly to `/admin` shows the "not admin" screen (existing behavior, unchanged).
- "Inserir custo" button is visible and works (since the preset grants `pode_adicionar_custo_manual`).
- In Relatórios, the project dropdown lists only the assigned project, the WhatsApp accordion/panel is not visible, but building a message, copying it, and "Abrir WhatsApp" still work, and "Salvar relatório" / "Enviar agora" still succeed (using the connection id resolved silently by Task 7's route).

- [ ] **Step 5: Confirm the original owner account is unaffected**

Log back in as the owner/admin account and confirm: all projects still visible, Vendas/Admin/Integrações still visible, dashboards still show full historical data (no cutoff), WhatsApp connection panel still visible and editable in Relatórios.
