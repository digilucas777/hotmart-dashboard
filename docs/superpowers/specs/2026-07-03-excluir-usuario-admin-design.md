# Design: Excluir usuário no painel Admin

**Data:** 2026-07-03
**Repositório:** hotmart-dashboard

---

## Objetivo

Hoje o painel `/admin` permite convidar usuários, editar permissões e reenviar convite, mas não permite excluir um usuário — é preciso ir direto no painel do Supabase. Adicionar um botão "Excluir" nativo no site, tanto para usuários ativos quanto para convites pendentes.

---

## Design

- **Nova rota:** `app/api/admin/delete-user/route.ts` — `POST { user_id }`. Segue o mesmo padrão de autenticação/autorização admin-only já usado em `app/api/admin/invite/route.ts` e `app/api/admin/permissions/route.ts` (`getAuthenticatedUser` + checagem `user_profiles.role === 'admin'`). Chama `supabase.auth.admin.deleteUser(user_id)` usando o client de service role.
- **Sem limpeza manual de tabelas:** `user_profiles.id` e `user_dashboard_permissions.user_id` já são `REFERENCES auth.users(id) ON DELETE CASCADE` (migrations 021 e 029) — apagar o usuário no Auth já apaga essas linhas relacionadas automaticamente.
- **UI em `app/admin/page.tsx`:** botão "Excluir" (ícone de lixeira, estilo vermelho como o botão "Excluir" já usado em `app/projects/page.tsx`) ao lado de "Editar permissões" (usuários ativos, linha ~462-468) e ao lado de "Reenviar convite" (convites pendentes, linha ~529-536). Clique abre um modal de confirmação simples (mesmo componente `Modal` já usado no restante do arquivo) mostrando o e-mail do usuário, com botão "Cancelar" e botão "Excluir" (variant danger). Só confirma a exclusão de fato após o clique no modal.
- **Após excluir:** remove o usuário da lista local (`users` ou `pendingUsers`, conforme o caso) sem precisar recarregar a página.

## Fora de escopo

- Não é possível excluir a própria conta admin por esta tela (a lista de usuários já filtra `role = 'user'`, então o admin nunca aparece nela).
- Não há "soft delete" ou histórico de usuários excluídos — a exclusão é permanente, refletindo o mesmo comportamento de excluir direto pelo Supabase.
