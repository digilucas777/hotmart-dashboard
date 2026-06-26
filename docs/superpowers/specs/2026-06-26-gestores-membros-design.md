# Design: Área de Membros — Trafego / BORDERLESS

**Data:** 2026-06-26  
**Repositório:** gestores-membros  
**Stack:** Next.js (App Router) + Supabase + Tailwind CSS + TypeScript + Vercel

---

## Objetivo

Plataforma de aulas em vídeo para gestores. Acesso via magic link (sem senha). Somente emails previamente cadastrados pelo admin conseguem entrar. Gestores apenas assistem — sem permissão de edição. Admin exclusivo para o dono do projeto.

---

## Rotas

| Rota | Acesso | Descrição |
|------|--------|-----------|
| `/login` | Público | Campo de email, envia magic link |
| `/aulas` | Gestores + Admin | Lista de módulos e aulas |
| `/aulas/[id]` | Gestores + Admin | Player Panda Video da aula |
| `/admin` | Admin only | Dashboard com resumo |
| `/admin/gestores` | Admin only | CRUD de gestores |
| `/admin/modulos` | Admin only | CRUD e reordenação de módulos |
| `/admin/aulas` | Admin only | CRUD e reordenação de aulas |

---

## Middleware de autenticação

Next.js middleware em `middleware.ts` na raiz do projeto:

- Rotas `/aulas/*`: exige sessão Supabase ativa. Redireciona para `/login` se não autenticado.
- Rotas `/admin/*`: exige sessão ativa E `session.user.email === process.env.ADMIN_EMAIL`. Redireciona para `/login` se não autenticado, para `/aulas` se autenticado mas não admin.
- `/login`: redireciona para `/aulas` se já autenticado.

---

## Fluxo de autenticação

1. Usuário acessa `/login`, digita email.
2. Server Action verifica se email existe na tabela `gestores` **ou** é igual a `ADMIN_EMAIL`.
3. Se não encontrado: retorna mensagem "Acesso não autorizado."
4. Se encontrado: chama `supabase.auth.signInWithOtp({ email })`.
5. Supabase envia magic link por email.
6. Usuário clica no link → callback Supabase → sessão criada.
7. Middleware redireciona: admin → `/admin`, gestor → `/aulas`.
8. No callback de sessão: atualiza `last_seen_at` e incrementa `login_count` na tabela `gestores`; insere registro na tabela `acessos`.

---

## Schema SQL (Supabase)

```sql
-- Gestores autorizados
CREATE TABLE gestores (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text UNIQUE NOT NULL,
  nome         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  login_count  int NOT NULL DEFAULT 0
);

-- Módulos opcionais (pastas de organização)
CREATE TABLE modulos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo     text NOT NULL,
  position   int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Aulas com embed Panda Video
CREATE TABLE aulas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo         text NOT NULL,
  descricao      text,
  panda_video_id text NOT NULL,
  modulo_id      uuid REFERENCES modulos(id) ON DELETE SET NULL,
  position       int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Log de acessos (para analytics no admin)
CREATE TABLE acessos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestor_id   uuid REFERENCES gestores(id) ON DELETE CASCADE,
  accessed_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: tabelas só acessíveis via service_role (server-side)
ALTER TABLE gestores ENABLE ROW LEVEL SECURITY;
ALTER TABLE modulos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE aulas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE acessos  ENABLE ROW LEVEL SECURITY;
```

Toda comunicação com o banco ocorre server-side (Server Actions ou Route Handlers) usando `SUPABASE_SERVICE_ROLE_KEY`. Nenhuma query é feita pelo browser diretamente.

---

## Estrutura de arquivos (Next.js App Router)

```
gestores-membros/
├── app/
│   ├── login/
│   │   └── page.tsx              # Tela de login com campo de email
│   ├── aulas/
│   │   ├── page.tsx              # Lista de módulos e aulas
│   │   └── [id]/
│   │       └── page.tsx          # Player Panda Video
│   ├── admin/
│   │   ├── page.tsx              # Dashboard admin
│   │   ├── gestores/
│   │   │   └── page.tsx
│   │   ├── modulos/
│   │   │   └── page.tsx
│   │   └── aulas/
│   │       └── page.tsx
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts          # Callback do magic link Supabase
│   └── layout.tsx
├── components/
│   ├── LoginForm.tsx
│   ├── VideoPlayer.tsx           # Iframe Panda Video
│   ├── AulaCard.tsx
│   ├── ModuloSection.tsx
│   └── admin/
│       ├── GestoresTable.tsx
│       ├── ModulosManager.tsx
│       └── AulasManager.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Browser client
│   │   ├── server.ts             # Server client (service role)
│   │   └── middleware.ts         # Supabase SSR helper
│   └── actions/
│       ├── auth.ts               # Server Actions de auth
│       ├── gestores.ts
│       ├── modulos.ts
│       └── aulas.ts
├── middleware.ts                 # Proteção de rotas
├── .env.local                    # SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL
└── README.md
```

---

## Player Panda Video

Embed via iframe em `VideoPlayer.tsx`:

```tsx
<iframe
  src={`https://player-vz-{account}.tv.pandavideo.com.br/embed/?v=${pandaVideoId}`}
  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
  allowFullScreen
  className="w-full aspect-video rounded-lg"
/>
```

O `panda_video_id` salvo no banco é o identificador do vídeo que o admin cola ao cadastrar a aula.

---

## Painel Admin

### /admin/gestores
- Tabela: Nome, Email, Cadastrado em, Último acesso, Total de logins
- Botão "Adicionar gestor" → modal com campos nome + email
- Botão "Remover" por linha → confirmação antes de deletar

### /admin/modulos
- Lista reordenável (drag-and-drop simples com `@dnd-kit/core`)
- Inline rename ao clicar no título
- Botão deletar (move aulas do módulo para "Sem módulo")

### /admin/aulas
- Cards agrupados por módulo
- Criar aula: título, descrição (opcional), ID Panda Video, módulo (opcional)
- Editar e deletar por card
- Reordenar dentro do módulo

### /admin (dashboard)
- Total de gestores cadastrados
- Gestores ativos (acessaram nos últimos 30 dias)
- Total de aulas e módulos
- Tabela de últimos acessos

---

## Visual e identidade

- **Tema:** escuro (dark mode padrão)
- **Nome:** "Trafego / BORDERLESS" na tela de login e no header da área de aulas
- **Fontes:** Inter (Tailwind padrão) ou Geist
- **Cores:** fundo escuro (#0a0a0a), acentos em branco/cinza, um destaque em cor vibrante (configurável via Tailwind)
- **Admin:** interface mais utilitária, fundo levemente diferente pra distinguir

---

## Variáveis de ambiente

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_EMAIL=seu@email.com
NEXT_PUBLIC_APP_URL=https://gestores-membros.vercel.app
```

---

## Deploy

1. Criar projeto no Supabase → rodar SQL do schema
2. Criar repositório `gestores-membros` no GitHub
3. Importar no Vercel → configurar variáveis de ambiente
4. Configurar Redirect URL no Supabase: `https://gestores-membros.vercel.app/auth/callback`

---

## Fora de escopo

- Upload de vídeo (só embed Panda Video)
- Progresso de aulas (sem rastreamento)
- Notificações por email além do magic link
- Multi-admin (só um admin via ADMIN_EMAIL)
- App mobile nativo
