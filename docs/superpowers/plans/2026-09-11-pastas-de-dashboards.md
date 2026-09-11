# Pastas de Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o admin (Lucas) organizar os dashboards em pastas nomeadas por gestor, visíveis no menu lateral e em "Meus Dashboards", sem mudar nada pra usuários não-admin.

**Architecture:** Duas tabelas novas (`dashboard_folders`, `dashboard_folder_projetos`) só-admin via RLS. Uma camada de dados compartilhada (`lib/dashboard-folders.ts`) usada por dois pontos de UI: um modal de gerenciamento em `UserAppShell.tsx` (criar/renomear/excluir pasta, marcar quais projetos entram em cada uma) e uma seção nova, adicional, de navegação rápida por pasta — uma em `UserAppShell.tsx` (acima da grade "Todos os dashboards" já existente, que fica **intocada**) e uma árvore expansível em `components/layout/Sidebar.tsx` (usado no app inteiro via `app/layout.tsx`).

**Tech Stack:** Next.js (App Router) + TypeScript + Supabase (Postgres/RLS/PostgREST), Tailwind, lucide-react. Este projeto não tem suíte de testes automatizados para o app principal (`app/`, `components/`) — verificação é `npx tsc --noEmit` + validação de dado real via SQL na Supabase + checagem manual no navegador, seguindo o padrão já usado neste repositório (ver commits recentes).

## Global Constraints

- **Aditivo, sem quebrar nada existente**: nenhuma tabela, policy ou comportamento atual pode ser alterado. A grade "Todos os dashboards" em `UserAppShell.tsx` (drag-and-drop incluso) permanece exatamente como está — a visão por pasta é uma seção **nova**, adicional, não uma substituição.
- **Só admin**: as duas tabelas novas só são lidas/escritas por `is_admin()` via RLS. Usuários não-admin não veem nenhuma pasta em lugar nenhum — a sidebar e o `UserAppShell` continuam idênticos pra eles.
- **Pasta é manual**, sem relação com `user_dashboard_permissions`/`projetos.user_id`.
- **Um projeto pode estar em várias pastas** — sem deduplicar visualmente quando isso acontecer.
- **Um nível só de pasta** — sem sub-pastas.
- **Sem drag-and-drop entre pastas nesta versão** — atribuição só via checkboxes no modal "Gerenciar pastas".

---

### Task 1: Migração — tabelas `dashboard_folders` e `dashboard_folder_projetos`

**Files:**
- Create (via Supabase MCP `apply_migration`, sem arquivo local — mesmo padrão já usado nas migrações 068-071 deste projeto): migração nomeada `dashboard_folders`.

**Interfaces:**
- Produces: tabelas `dashboard_folders(id uuid, nome text, ordem int, created_at timestamptz)` e `dashboard_folder_projetos(folder_id uuid, projeto_id uuid)` (chave primária composta), ambas com RLS restrita a `is_admin()`.

- [ ] **Step 1: Aplicar a migração**

Use a ferramenta MCP `mcp__claude_ai_Supabase__apply_migration` (projeto `czuyzjlqliotwnzfllbe`) com este SQL:

```sql
-- Pastas de dashboards (organização manual do admin, sem relação com permissão
-- de acesso) — ver docs/superpowers/specs/2026-09-11-pastas-de-dashboards-design.md
create table dashboard_folders (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create table dashboard_folder_projetos (
  folder_id uuid not null references dashboard_folders(id) on delete cascade,
  projeto_id uuid not null references projetos(id) on delete cascade,
  primary key (folder_id, projeto_id)
);

alter table dashboard_folders enable row level security;
alter table dashboard_folder_projetos enable row level security;

create policy "admin gerencia dashboard_folders" on dashboard_folders
for all using (is_admin()) with check (is_admin());

create policy "admin gerencia dashboard_folder_projetos" on dashboard_folder_projetos
for all using (is_admin()) with check (is_admin());
```

- [ ] **Step 2: Verificar que as tabelas existem e a RLS está ativa**

Rode via `mcp__claude_ai_Supabase__execute_sql`:

```sql
select relname, relrowsecurity from pg_class
where relname in ('dashboard_folders', 'dashboard_folder_projetos');
```

Expected: 2 linhas, `relrowsecurity = true` nas duas.

- [ ] **Step 3: Verificar que um usuário não-admin não consegue ler**

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
select count(*) from dashboard_folders;
rollback;
```

Expected: `count = 0` (RLS bloqueia, não erro de permissão de tabela) — confirma que a policy está de fato restringindo, não só existindo.

---

### Task 2: Camada de dados — `lib/dashboard-folders.ts`

**Files:**
- Create: `lib/dashboard-folders.ts`.

**Interfaces:**
- Consumes: `supabase` de `./supabase` (padrão idêntico a `lib/vendas-aggregation.ts`).
- Produces (usado pelas Tasks 3, 4 e 5 — **todas importam `DashboardFolder` e as funções abaixo de `@/lib/dashboard-folders`, nunca de `@/lib/types`**):
  - `type DashboardFolder = { id: string; nome: string; ordem: number }`
  - `fetchFolders(): Promise<DashboardFolder[]>`
  - `fetchFolderProjetoIds(): Promise<Record<string, string[]>>` (chave = `folder_id`, valor = lista de `projeto_id`)
  - `createFolder(nome: string, ordem: number): Promise<DashboardFolder>`
  - `renameFolder(id: string, nome: string): Promise<void>`
  - `deleteFolder(id: string): Promise<void>`
  - `setFolderProjetos(folderId: string, projetoIds: string[]): Promise<void>` (substitui a lista inteira de projetos daquela pasta)

- [ ] **Step 1: Criar `lib/dashboard-folders.ts`**

O tipo `DashboardFolder` é definido e exportado diretamente aqui (não em
`lib/types.ts`) — é local a essa feature, e assim evita qualquer risco de
um arquivo importar de um lugar e outro importar de outro.

```typescript
import { supabase } from './supabase'

export type DashboardFolder = { id: string; nome: string; ordem: number }

export async function fetchFolders(): Promise<DashboardFolder[]> {
  const { data, error } = await supabase
    .from('dashboard_folders')
    .select('id, nome, ordem')
    .order('ordem', { ascending: true })
  if (error) throw error
  return (data ?? []) as DashboardFolder[]
}

export async function fetchFolderProjetoIds(): Promise<Record<string, string[]>> {
  const { data, error } = await supabase
    .from('dashboard_folder_projetos')
    .select('folder_id, projeto_id')
  if (error) throw error
  const map: Record<string, string[]> = {}
  for (const row of (data ?? []) as { folder_id: string; projeto_id: string }[]) {
    map[row.folder_id] = map[row.folder_id] ?? []
    map[row.folder_id].push(row.projeto_id)
  }
  return map
}

export async function createFolder(nome: string, ordem: number): Promise<DashboardFolder> {
  const { data, error } = await supabase
    .from('dashboard_folders')
    .insert({ nome, ordem })
    .select('id, nome, ordem')
    .single()
  if (error) throw error
  return data as DashboardFolder
}

export async function renameFolder(id: string, nome: string): Promise<void> {
  const { error } = await supabase.from('dashboard_folders').update({ nome }).eq('id', id)
  if (error) throw error
}

export async function deleteFolder(id: string): Promise<void> {
  const { error } = await supabase.from('dashboard_folders').delete().eq('id', id)
  if (error) throw error
}

export async function setFolderProjetos(folderId: string, projetoIds: string[]): Promise<void> {
  const { error: delError } = await supabase
    .from('dashboard_folder_projetos')
    .delete()
    .eq('folder_id', folderId)
  if (delError) throw delError
  if (projetoIds.length === 0) return
  const { error: insError } = await supabase
    .from('dashboard_folder_projetos')
    .insert(projetoIds.map(projeto_id => ({ folder_id: folderId, projeto_id })))
  if (insError) throw insError
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados a `lib/dashboard-folders.ts`.

- [ ] **Step 3: Validar as funções contra o banco real**

Como não há suíte de testes pro app principal, valide com uma chamada real via SQL (simulando o que as funções fazem) — rode via `execute_sql`:

```sql
insert into dashboard_folders (nome, ordem) values ('_teste_plano', 0) returning id;
-- copie o id retornado e rode:
-- insert into dashboard_folder_projetos (folder_id, projeto_id)
--   values ('<id copiado>', (select id from projetos limit 1));
-- select * from dashboard_folder_projetos where folder_id = '<id copiado>';
-- delete from dashboard_folders where id = '<id copiado>'; -- limpa o teste (cascade apaga o vínculo)
```

Expected: insert/select funcionam, delete em cascata remove o vínculo também (confirma o `on delete cascade` da Task 1).

- [ ] **Step 4: Commit**

```bash
git add lib/dashboard-folders.ts
git commit -m "feat: camada de dados pra pastas de dashboards"
```

---

### Task 3: Modal "Gerenciar pastas" em `UserAppShell.tsx`

**Files:**
- Create: `components/saas/ManageFoldersModal.tsx`.
- Modify: `components/saas/UserAppShell.tsx` — novo estado, novo botão "Gerenciar pastas" ao lado de "Combinar dashboards" (linha ~539-547 hoje), carregar `folders`/`folderProjetos` no `init()` existente.

**Interfaces:**
- Consumes: `DashboardFolder`, `fetchFolders`, `fetchFolderProjetoIds`, `createFolder`, `renameFolder`, `deleteFolder`, `setFolderProjetos` de `@/lib/dashboard-folders` (Task 2); `Projeto` de `@/lib/types`.
- Produces: componente `ManageFoldersModal` reutilizado apenas aqui nesta task.

- [ ] **Step 1: Criar `components/saas/ManageFoldersModal.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Check, Folder, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { Projeto } from '@/lib/types'
import type { DashboardFolder } from '@/lib/dashboard-folders'
import { createFolder, renameFolder, deleteFolder, setFolderProjetos } from '@/lib/dashboard-folders'

export function ManageFoldersModal({
  open,
  onClose,
  folders,
  folderProjetos,
  allProjetos,
  onChanged,
}: {
  open: boolean
  onClose: () => void
  folders: DashboardFolder[]
  folderProjetos: Record<string, string[]>
  allProjetos: Projeto[]
  onChanged: () => Promise<void>
}) {
  const [newFolderName, setNewFolderName] = useState('')
  const [savingNew, setSavingNew] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null)
  const [savingAssign, setSavingAssign] = useState(false)

  if (!open) return null

  async function handleCreate() {
    const nome = newFolderName.trim()
    if (!nome) return
    setSavingNew(true)
    await createFolder(nome, folders.length)
    setNewFolderName('')
    setSavingNew(false)
    await onChanged()
  }

  async function handleRename(id: string) {
    const nome = editingName.trim()
    if (!nome) { setEditingId(null); return }
    await renameFolder(id, nome)
    setEditingId(null)
    await onChanged()
  }

  async function handleDelete(id: string) {
    await deleteFolder(id)
    await onChanged()
  }

  async function handleToggleProjeto(folderId: string, projetoId: string, checked: boolean) {
    setSavingAssign(true)
    const current = folderProjetos[folderId] ?? []
    const next = checked ? [...current, projetoId] : current.filter(id => id !== projetoId)
    await setFolderProjetos(folderId, next)
    setSavingAssign(false)
    await onChanged()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-[#0b0d14] p-6 shadow-2xl shadow-black/60">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20 text-cyan-200">
              <Folder size={19} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">Organização</p>
              <h2 className="mt-1 text-xl font-black">Gerenciar pastas</h2>
            </div>
          </div>
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 text-slate-400 hover:text-white">
            <X size={17} />
          </button>
        </div>

        <div className="flex gap-2">
          <input
            value={newFolderName}
            onChange={event => setNewFolderName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') void handleCreate() }}
            placeholder="Nome da nova pasta (ex: Pedro)"
            className="h-11 flex-1 rounded-2xl border border-white/10 bg-black/25 px-4 text-sm text-white outline-none placeholder:text-slate-700 focus:border-cyan-300/60"
          />
          <button
            onClick={() => void handleCreate()}
            disabled={savingNew || !newFolderName.trim()}
            className="flex h-11 items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 text-sm font-black text-white disabled:opacity-50"
          >
            {savingNew ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            Criar
          </button>
        </div>

        <div className="mt-5 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
          {folders.length === 0 && (
            <p className="py-6 text-center text-xs text-slate-500">Nenhuma pasta criada ainda.</p>
          )}
          {folders.map(folder => (
            <div key={folder.id} className="rounded-2xl border border-white/10 bg-white/[0.02]">
              <div className="flex items-center gap-2 px-4 py-3">
                {editingId === folder.id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={event => setEditingName(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') void handleRename(folder.id) }}
                    className="h-9 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-cyan-300/60"
                  />
                ) : (
                  <button
                    onClick={() => setExpandedFolderId(prev => prev === folder.id ? null : folder.id)}
                    className="flex-1 truncate text-left text-sm font-bold text-white"
                  >
                    {folder.nome}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {(folderProjetos[folder.id] ?? []).length} projeto(s)
                    </span>
                  </button>
                )}
                {editingId === folder.id ? (
                  <button onClick={() => void handleRename(folder.id)} className="flex h-8 w-8 items-center justify-center rounded-xl text-emerald-300 hover:bg-emerald-400/10">
                    <Check size={15} />
                  </button>
                ) : (
                  <button onClick={() => { setEditingId(folder.id); setEditingName(folder.nome) }} className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-white/5 hover:text-white">
                    <Pencil size={13} />
                  </button>
                )}
                <button onClick={() => void handleDelete(folder.id)} className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 hover:bg-red-500/10 hover:text-red-300">
                  <Trash2 size={13} />
                </button>
              </div>
              {expandedFolderId === folder.id && (
                <div className="space-y-1 border-t border-white/5 px-4 py-3">
                  {allProjetos.map(projeto => {
                    const checked = (folderProjetos[folder.id] ?? []).includes(projeto.id)
                    return (
                      <label key={projeto.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-slate-300 hover:bg-white/[0.03]">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={savingAssign}
                          onChange={event => void handleToggleProjeto(folder.id, projeto.id, event.target.checked)}
                          className="h-4 w-4 rounded border-white/20 bg-black/25 text-cyan-400"
                        />
                        <span className="truncate">{projeto.nome}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rodar o tsc pra confirmar que o componente novo compila**

Run: `npx tsc --noEmit`
Expected: sem erros em `ManageFoldersModal.tsx` (pode haver erros pré-existentes em outros arquivos não relacionados — ignore esses).

- [ ] **Step 3: Adicionar imports e estado em `UserAppShell.tsx`**

No topo do arquivo, adicione ao import de ícones já existente (linha ~6-29) o ícone `Folder`, e adicione um novo import:

```typescript
import { ManageFoldersModal } from './ManageFoldersModal'
import { fetchFolders, fetchFolderProjetoIds } from '@/lib/dashboard-folders'
import type { DashboardFolder } from '@/lib/dashboard-folders'
```

Perto de `const [dashboards, setDashboards] = useState<Projeto[]>([])` (linha ~83), adicione:

```typescript
const [folders, setFolders] = useState<DashboardFolder[]>([])
const [folderProjetos, setFolderProjetos] = useState<Record<string, string[]>>({})
const [foldersModalOpen, setFoldersModalOpen] = useState(false)

async function reloadFolders() {
  const [foldersData, projetosMap] = await Promise.all([fetchFolders(), fetchFolderProjetoIds()])
  setFolders(foldersData)
  setFolderProjetos(projetosMap)
}
```

- [ ] **Step 4: Carregar as pastas junto com o resto, só quando admin**

Encontre o bloco `if (admin) { setIsAdmin(true); ... }` (mesmo padrão usado em `Sidebar.tsx`, procure pela definição equivalente dentro de `init()` em `UserAppShell.tsx` — é onde `setIsAdmin(true)` é chamado pela primeira vez) e logo depois de setar `isAdmin` para `true`, adicione:

```typescript
void reloadFolders()
```

- [ ] **Step 5: Adicionar o botão "Gerenciar pastas" e o modal**

Em `components/saas/UserAppShell.tsx`, no bloco que já tem o botão "Combinar dashboards" (linha ~539-547), adicione um botão irmão, dentro do mesmo `{isAdmin && (...)}`:

```typescript
{isAdmin && (
  <>
    <button
      onClick={() => setFoldersModalOpen(true)}
      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-300/30 bg-white/[0.04] px-5 py-3 text-sm font-black text-cyan-100 transition-colors hover:border-cyan-300/50 hover:bg-white/[0.08]"
    >
      <Folder size={16} />
      Gerenciar pastas
    </button>
    <button
      onClick={() => { setEditingCombo(null); setComboModalOpen(true) }}
      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-300/30 bg-white/[0.04] px-5 py-3 text-sm font-black text-violet-200 transition-colors hover:border-violet-300/50 hover:bg-white/[0.08]"
    >
      <Layers size={16} />
      Combinar dashboards
    </button>
  </>
)}
```

(Substitua o bloco `{isAdmin && (<button onClick={() => { setEditingCombo(null); setComboModalOpen(true) }} ...>Combinar dashboards</button>)}` original por este, que envolve os dois botões.)

Por fim, antes do fechamento do componente (perto de onde outros modais como `<CombineDashboardsModal .../>` já são renderizados condicionalmente), adicione:

```typescript
<ManageFoldersModal
  open={foldersModalOpen}
  onClose={() => setFoldersModalOpen(false)}
  folders={folders}
  folderProjetos={folderProjetos}
  allProjetos={dashboards}
  onChanged={reloadFolders}
/>
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: nenhum erro novo.

- [ ] **Step 7: Verificação manual**

1. Rode `npm run dev` (ou confirme que o deploy de preview subiu).
2. Logado como admin, vá em "Meus Dashboards", clique "Gerenciar pastas".
3. Crie uma pasta "Pedro", clique nela pra expandir, marque 2 projetos.
4. Fechar e reabrir o modal — os 2 projetos devem continuar marcados (persistiu no banco).
5. Renomeie a pasta pra "Pedro Tráfego" — deve refletir na hora.
6. Exclua a pasta — deve sumir da lista.

- [ ] **Step 8: Commit**

```bash
git add components/saas/ManageFoldersModal.tsx components/saas/UserAppShell.tsx
git commit -m "feat: modal de gerenciar pastas de dashboards (só admin)"
```

---

### Task 4: Seção "Por pasta" em `UserAppShell.tsx` (adicional, acima da grade existente)

**Files:**
- Modify: `components/saas/UserAppShell.tsx` — nova seção JSX, inserida **antes** da seção `<section className="mt-8 ...">` que contém "Todos os dashboards" (linha ~532 hoje). Essa seção existente **não é tocada**.

**Interfaces:**
- Consumes: `folders`, `folderProjetos`, `dashboards` (já carregados pela Task 3).

- [ ] **Step 1: Adicionar a seção agrupada**

Logo antes de `<section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">` (o início do bloco "Todos os dashboards"), insira:

```typescript
{isAdmin && folders.length > 0 && (
  <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
    <h2 className="text-lg font-black">Por pasta</h2>
    <p className="mt-1 text-sm text-slate-400">
      Organização rápida — o mesmo dashboard pode aparecer em mais de uma pasta.
    </p>
    <div className="mt-5 space-y-5">
      {folders.map(folder => {
        const idsNaPasta = folderProjetos[folder.id] ?? []
        const projetosDaPasta = dashboards.filter(d => idsNaPasta.includes(d.id))
        if (projetosDaPasta.length === 0) return null
        return (
          <div key={folder.id}>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-200/70">
              {folder.nome}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {projetosDaPasta.map(projeto => (
                <Link
                  key={projeto.id}
                  href={`/dashboard/${projeto.id}`}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-slate-200 transition-colors hover:border-cyan-300/30 hover:text-white"
                >
                  <LayoutDashboard size={14} className="shrink-0 text-cyan-300" />
                  <span className="truncate">{projeto.nome}</span>
                </Link>
              ))}
            </div>
          </div>
        )
      })}
      {(() => {
        const idsComPasta = new Set(Object.values(folderProjetos).flat())
        const semPasta = dashboards.filter(d => !idsComPasta.has(d.id))
        if (semPasta.length === 0) return null
        return (
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
              Sem pasta
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {semPasta.map(projeto => (
                <Link
                  key={projeto.id}
                  href={`/dashboard/${projeto.id}`}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-slate-200 transition-colors hover:border-cyan-300/30 hover:text-white"
                >
                  <LayoutDashboard size={14} className="shrink-0 text-slate-500" />
                  <span className="truncate">{projeto.nome}</span>
                </Link>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  </section>
)}
```

Note que essa seção só aparece quando `folders.length > 0` — um admin que ainda não criou nenhuma pasta não vê seção vazia, só a grade "Todos os dashboards" de sempre.

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Verificação manual**

1. Com a pasta "Pedro" criada na Task 3 (com 2 projetos), recarregue "Meus Dashboards".
2. Deve aparecer uma seção "Por pasta" acima de "Todos os dashboards", com "Pedro" e os 2 projetos, mais uma seção "Sem pasta" com o resto.
3. Confirme que a grade "Todos os dashboards" abaixo continua idêntica a antes (mesma ordem, drag-and-drop funcionando).
4. Logado como um usuário não-admin (ou olhando o código: `isAdmin` false), confirme que a seção "Por pasta" não aparece.

- [ ] **Step 4: Commit**

```bash
git add components/saas/UserAppShell.tsx
git commit -m "feat: seção 'Por pasta' em Meus Dashboards (só admin, aditiva)"
```

---

### Task 5: Árvore de pastas expansível em `components/layout/Sidebar.tsx`

**Files:**
- Modify: `components/layout/Sidebar.tsx`.

**Interfaces:**
- Consumes: `fetchFolders`, `fetchFolderProjetoIds` de `@/lib/dashboard-folders`; precisa também da lista de projetos (id+nome) — busca direta via `supabase.from('projetos').select('id, nome').is('deleted_at', null).order('nome')`, já que `Sidebar.tsx` não tem essa lista hoje.

- [ ] **Step 1: Adicionar imports e estado**

No topo de `components/layout/Sidebar.tsx`, adicione aos imports de ícones (linha 6-17): `ChevronDown, ChevronRight, Folder`. Adicione um novo import:

```typescript
import { fetchFolders, fetchFolderProjetoIds } from '@/lib/dashboard-folders'
import type { DashboardFolder } from '@/lib/dashboard-folders'
```

Logo após `const [canSeeVendas, setCanSeeVendas] = useState(false)` (linha 38), adicione:

```typescript
const [folders, setFolders] = useState<DashboardFolder[]>([])
const [folderProjetos, setFolderProjetos] = useState<Record<string, string[]>>({})
const [allProjetosSidebar, setAllProjetosSidebar] = useState<{ id: string; nome: string }[]>([])
const [dashboardsTreeOpen, setDashboardsTreeOpen] = useState(false)
const [openFolderIds, setOpenFolderIds] = useState<Set<string>>(new Set())
```

- [ ] **Step 2: Carregar o estado de expandido do `localStorage` (uma vez, no mount)**

Logo depois dos `useState` acima, adicione:

```typescript
useEffect(() => {
  try {
    const savedOpen = localStorage.getItem('sidebar_dashboards_tree_open')
    if (savedOpen === 'true') setDashboardsTreeOpen(true)
    const savedFolders = localStorage.getItem('sidebar_open_folder_ids')
    if (savedFolders) setOpenFolderIds(new Set(JSON.parse(savedFolders) as string[]))
  } catch {
    // localStorage indisponível (modo privado, etc) — segue com os padrões
  }
}, [])

function toggleDashboardsTree() {
  setDashboardsTreeOpen(prev => {
    const next = !prev
    try { localStorage.setItem('sidebar_dashboards_tree_open', String(next)) } catch { /* ignora */ }
    return next
  })
}

function toggleFolderOpen(folderId: string) {
  setOpenFolderIds(prev => {
    const next = new Set(prev)
    if (next.has(folderId)) next.delete(folderId)
    else next.add(folderId)
    try { localStorage.setItem('sidebar_open_folder_ids', JSON.stringify(Array.from(next))) } catch { /* ignora */ }
    return next
  })
}
```

- [ ] **Step 3: Buscar as pastas quando o usuário for admin**

No `useEffect` existente (linha 42-71), dentro do bloco `if (admin) { setIsAdmin(true); setCanSeeVendas(true); return }`, adicione a busca antes do `return`:

```typescript
if (admin) {
  setIsAdmin(true)
  setCanSeeVendas(true)
  const [foldersData, projetosMap, projetosRes] = await Promise.all([
    fetchFolders(),
    fetchFolderProjetoIds(),
    supabase.from('projetos').select('id, nome').is('deleted_at', null).order('nome'),
  ])
  setFolders(foldersData)
  setFolderProjetos(projetosMap)
  setAllProjetosSidebar((projetosRes.data ?? []) as { id: string; nome: string }[])
  return
}
```

- [ ] **Step 4: Renderizar a árvore expansível**

Substitua o item "Dashboards" dentro do `.map(item => ...)` do `<nav>` (linhas 115-136) por uma renderização especial só pra esse item quando `isAdmin`. Troque o corpo do `visibleNavItems.map(item => {...})` por:

```typescript
{visibleNavItems.map(item => {
  const active = isNavActive(item.href, pathname)
  const Icon = item.icon
  if (item.href === '/dashboard' && isAdmin) {
    return (
      <div key={item.href}>
        <div
          className={`flex items-center gap-1 rounded-xl px-1 py-0.5 transition-colors ${
            active ? 'text-cyan-100' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
          }`}
          style={active ? { background: 'linear-gradient(135deg, rgba(0,212,255,0.12), rgba(139,92,246,0.12))' } : undefined}
        >
          <Link href={item.href} title={item.label} className="flex flex-1 items-center gap-3 px-2 py-2">
            <Icon size={17} className="flex-shrink-0" />
            <span className="app-sidebar-label text-sm font-medium">{item.label}</span>
          </Link>
          {folders.length > 0 && (
            <button onClick={toggleDashboardsTree} className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg hover:bg-white/10" title="Pastas">
              {dashboardsTreeOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
        </div>
        {dashboardsTreeOpen && folders.length > 0 && (
          <div className="ml-4 mt-1 space-y-0.5 border-l border-white/10 pl-3">
            {folders.map(folder => {
              const idsNaPasta = folderProjetos[folder.id] ?? []
              const projetosDaPasta = allProjetosSidebar.filter(p => idsNaPasta.includes(p.id))
              if (projetosDaPasta.length === 0) return null
              const folderOpen = openFolderIds.has(folder.id)
              return (
                <div key={folder.id}>
                  <button
                    onClick={() => toggleFolderOpen(folder.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  >
                    {folderOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    <Folder size={12} />
                    <span className="truncate">{folder.nome}</span>
                  </button>
                  {folderOpen && (
                    <div className="ml-4 space-y-0.5 border-l border-white/5 pl-3">
                      {projetosDaPasta.map(projeto => (
                        <Link
                          key={projeto.id}
                          href={`/dashboard/${projeto.id}`}
                          className="block truncate rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-white/5 hover:text-slate-200"
                        >
                          {projeto.nome}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }
  return (
    <Link
      key={item.href}
      href={item.href}
      title={item.label}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
        active ? 'text-cyan-100' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
      }`}
      style={active ? { background: 'linear-gradient(135deg, rgba(0,212,255,0.12), rgba(139,92,246,0.12))' } : undefined}
    >
      <Icon size={17} className="flex-shrink-0" />
      <span className="app-sidebar-label text-sm font-medium">{item.label}</span>
    </Link>
  )
})}
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 6: Verificação manual**

1. Logado como admin, com a pasta "Pedro" criada, entre em qualquer dashboard (ex: `/dashboard/<id>`).
2. No menu lateral, "Dashboards" deve ter uma setinha ao lado (só porque existe pelo menos 1 pasta).
3. Clique na seta — expande mostrando "Pedro"; clique em "Pedro" — expande mostrando os projetos daquela pasta, cada um linkando pro dashboard certo.
4. Navegue pra outra página (ex: Vendas) — o estado expandido/recolhido deve continuar igual (persistiu via `localStorage`).
5. Logado como usuário não-admin, confirme que "Dashboards" não tem seta nenhuma — visual idêntico a antes desta mudança.

- [ ] **Step 7: Commit**

```bash
git add components/layout/Sidebar.tsx
git commit -m "feat: árvore de pastas expansível no menu lateral (só admin)"
```

---

### Task 6: Limpeza final e verificação de regressão

**Files:** nenhum arquivo novo — só verificação.

- [ ] **Step 1: Rodar o tsc uma última vez no projeto inteiro**

Run: `npx tsc --noEmit`
Expected: zero erros.

- [ ] **Step 2: Confirmar que nada quebrou pra usuário não-admin**

Verificação manual: logado como um gestor comum (ex: Pedro), confirme que:
- A sidebar está pixel-idêntica à versão anterior (sem seta em "Dashboards").
- "Meus Dashboards" não mostra a seção "Por pasta" nem o botão "Gerenciar pastas".
- Duplicar/editar/excluir dashboard continuam funcionando como antes.

- [ ] **Step 3: Confirmar que a grade "Todos os dashboards" do admin não mudou**

Verificação manual: logado como admin, confirme que a grade de baixo ("Todos os dashboards") tem a mesma ordem, os mesmos botões (Editar/Duplicar/Excluir) e o drag-and-drop continua reordenando normalmente — a única coisa nova na tela é a seção "Por pasta" acima dela.

- [ ] **Step 4: Deploy**

```bash
git push
```

Depois, confirme o deploy no Vercel via `mcp__claude_ai_Vercel__get_deployment` até `readyState: "READY"`, como já é feito neste projeto pra toda mudança.
