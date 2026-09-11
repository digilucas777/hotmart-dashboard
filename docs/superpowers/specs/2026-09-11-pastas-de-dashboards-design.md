# Pastas de dashboards — Design

## Contexto

O Lucas vai trazer vários gestores novos pra plataforma (Pedro, Rubens, e
outros no futuro), criando um dashboard por gestor/projeto. A lista de
dashboards ("Meus Dashboards" e o seletor "Trocar dashboard" no menu lateral)
já está ficando grande e vai continuar crescendo — sem organização, vira uma
lista longa e difícil de navegar.

Pedido do Lucas: agrupar os projetos em pastas nomeadas por gestor (Lucas,
Pedro, Rubens, ...), visíveis tanto no menu lateral quanto na tela "Meus
Dashboards".

## Decisões (confirmadas com o Lucas)

1. **Pasta é organização manual, não ligada a permissão.** O Lucas decide em
   qual pasta cada projeto entra — não é automático a partir de quem tem
   acesso ao projeto hoje (`user_dashboard_permissions` / `projetos.user_id`
   continuam controlando *acesso*; pasta controla só *organização visual*).
2. **Um projeto pode estar em mais de uma pasta ao mesmo tempo** (ex: um
   projeto gerenciado junto pelo Pedro e pelo Rubens aparece nas duas pastas).
3. **Só admin gerencia pastas** — criar, renomear, excluir pasta, e decidir em
   quais pastas cada projeto entra. Gestores (usuários não-admin) **não veem
   pastas** — a visão deles continua igual à de hoje (lista plana dos
   projetos que já têm acesso). Pastas são uma ferramenta de organização do
   admin sobre a visão dele mesmo, não uma mudança de permissão nem de UX
   pros gestores.
4. **Aparece em dois lugares**, os dois só pra admin:
   - Menu lateral: o link "Dashboards" ganha uma seta expansível; expandindo,
     mostra as pastas, e cada pasta expande mostrando os projetos dentro
     (link direto pro dashboard).
   - Tela "Meus Dashboards" (`UserAppShell.tsx`): os cards continuam do jeito
     que são hoje, só que agrupados em seções por pasta.
5. **Projeto sem pasta nenhuma** aparece numa seção "Sem pasta" — nunca some
   de vista por falta de organização.
6. **Sem pastas aninhadas** (sub-pastas) — um nível só, como o Lucas descreveu
   ("pasta com nome do gestor, projeto logo abaixo").

## Modelo de dados

Duas tabelas novas, seguindo o padrão de RLS já usado no projeto
(`is_admin()` de `lib`/policies existentes):

```sql
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
```

RLS: só `is_admin()` pode ler/escrever as duas tabelas (nenhuma outra role
precisa, já que gestores não veem pastas).

## UI

### Tela "Meus Dashboards" (`components/saas/UserAppShell.tsx`)

- Só renderiza agrupado por pasta quando `isAdmin` (a tela já sabe o papel do
  usuário logado, reaproveita essa checagem existente).
- Uma seção por pasta (nome da pasta como cabeçalho), na ordem de `ordem`;
  seção final "Sem pasta" pros projetos que não estão em nenhuma.
- Um projeto em múltiplas pastas aparece repetido em cada seção
  correspondente (aceito conforme decisão nº2 — mais simples que deduplicar
  visualmente).
- Botão "Gerenciar pastas" (perto do botão "Combinar dashboards" já
  existente) abre um modal simples: criar pasta, renomear, excluir, e uma
  lista de checkboxes por projeto pra marcar em quais pastas ele entra
  (reaproveita o padrão de `PermissionsProjectList` já existente no admin).

### Menu lateral

- `components/layout/Sidebar.tsx` — componente único, renderizado uma vez em
  `app/layout.tsx` (raiz), usado em toda a aplicação. Já sabe se o usuário é
  admin (`isAdmin`, linha ~37-58) e já tem a entrada "Dashboards" em
  `NAV_ITEMS` (linha ~21).
- Ganha, só quando `isAdmin`, uma seta ao lado de "Dashboards" que expande
  inline a árvore de pastas → projetos, sem sair da página atual.
- Estado de expandido/recolhido (do menu geral e de cada pasta) fica em
  `localStorage`, pra não fechar sozinho a cada navegação.

## Garantia de não quebrar o que já funciona

- Nenhuma tabela existente é alterada — só duas tabelas novas
  (`dashboard_folders`, `dashboard_folder_projetos`), aditivas.
- `Sidebar.tsx`: `NAV_ITEMS` e o comportamento atual de cada link não mudam;
  a árvore de pastas é um bloco novo, adicional, que só aparece quando
  `isAdmin === true` — usuário não-admin não vê nenhuma diferença na
  sidebar.
- `UserAppShell.tsx`: o agrupamento por pasta só se aplica quando
  `isAdmin === true`; a renderização atual dos cards (não-admin) permanece
  exatamente a mesma, sem nenhuma condição nova no caminho dela.
- Nenhuma policy de RLS existente é tocada — só policies novas nas 2 tabelas
  novas.

## Fora de escopo (explicitamente adiado)

- Gestores não-admin não ganham visão de pastas nesta versão.
- Sem drag-and-drop pra mover projeto entre pastas nesta versão — só via
  checkboxes no modal "Gerenciar pastas" (like the existing
  `PermissionsProjectList` pattern).
- Sem sub-pastas.
