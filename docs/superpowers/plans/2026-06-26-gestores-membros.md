# Gestores Membros — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a members-area app called "Trafego / BORDERLESS" where pre-registered managers access video lessons via magic link, with an admin panel for managing users and content.

**Architecture:** Single Next.js 15 App Router application. All database queries run server-side via service role key. Next.js middleware guards all protected routes. Supabase Auth handles magic link email delivery; a custom whitelist check gates who can request a link.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS v3, Supabase (`@supabase/ssr` + `@supabase/supabase-js`), `@dnd-kit/core` + `@dnd-kit/sortable` for drag-to-reorder, Vercel deployment.

## Global Constraints

- All Supabase queries from server-side only (service role key). Never expose service key to client.
- Magic link only for emails in `gestores` table OR `ADMIN_EMAIL` env var.
- Admin access gated by `ADMIN_EMAIL` env var in middleware — no DB flag.
- Dark theme only (`#0a0a0a` background). Brand name "Trafego / BORDERLESS" appears on login and member header.
- Panda Video embed: accept full iframe code OR direct URL in admin — always store final URL.
- TypeScript strict mode on.
- New standalone project in directory `gestores-membros/` (sibling to `hotmart-dashboard/`).

---

## File Map

```
gestores-membros/
├── supabase/
│   └── schema.sql                          # Full DB schema + RLS + helper function
├── app/
│   ├── globals.css
│   ├── layout.tsx                          # Root layout (dark bg, Geist font)
│   ├── page.tsx                            # Redirect to /login
│   ├── login/
│   │   └── page.tsx                        # Login page (uses LoginForm)
│   ├── aulas/
│   │   ├── page.tsx                        # Member: list all modules + lessons
│   │   └── [id]/
│   │       └── page.tsx                    # Member: video player page
│   ├── admin/
│   │   ├── layout.tsx                      # Admin sidebar + nav
│   │   ├── page.tsx                        # Admin: dashboard stats
│   │   ├── gestores/
│   │   │   └── page.tsx                    # Admin: manage gestores
│   │   ├── modulos/
│   │   │   └── page.tsx                    # Admin: manage modules
│   │   └── aulas/
│   │       └── page.tsx                    # Admin: manage lessons
│   └── auth/
│       └── callback/
│           └── route.ts                    # Magic link callback
├── components/
│   ├── LoginForm.tsx                       # Client: email input + submit
│   ├── VideoPlayer.tsx                     # Client: Panda Video iframe
│   ├── AulaCard.tsx                        # Server: lesson card
│   ├── ModuloSection.tsx                   # Server: module header + lesson list
│   └── admin/
│       ├── AdminNav.tsx                    # Client: sidebar nav links
│       ├── GestoresTable.tsx               # Client: table + add/delete gestor
│       ├── ModulosManager.tsx              # Client: sortable modules list
│       └── AulasManager.tsx               # Client: sortable lessons per module
├── lib/
│   ├── supabase/
│   │   ├── client.ts                       # Browser Supabase client
│   │   ├── server.ts                       # Server Supabase client (anon)
│   │   └── service.ts                      # Server Supabase client (service role)
│   ├── actions/
│   │   ├── auth.ts                         # sendMagicLink server action
│   │   ├── gestores.ts                     # CRUD + stats for gestores
│   │   ├── modulos.ts                      # CRUD + reorder for modulos
│   │   └── aulas.ts                        # CRUD + reorder for aulas
│   └── utils.ts                            # extractPandaVideoUrl, formatDate
├── types/
│   └── db.ts                               # TypeScript types for all tables
├── middleware.ts                           # Route protection
├── tailwind.config.ts
├── jest.config.ts
├── jest.setup.ts
├── .env.local.example
└── README.md
```

---

### Task 1: Scaffold project and configure tooling

**Files:**
- Create: `gestores-membros/` (via create-next-app)
- Create: `gestores-membros/jest.config.ts`
- Create: `gestores-membros/jest.setup.ts`
- Create: `gestores-membros/tailwind.config.ts` (replace generated)
- Create: `gestores-membros/.env.local.example`

**Interfaces:**
- Produces: runnable Next.js 15 project with Jest configured

- [ ] **Step 1: Scaffold Next.js project**

Run from the parent of `hotmart-dashboard` (i.e., `C:/Users/User/`):

```bash
cd C:/Users/User
npx create-next-app@latest gestores-membros \
  --typescript \
  --tailwind \
  --app \
  --no-src-dir \
  --import-alias "@/*" \
  --yes
cd gestores-membros
```

Expected output: "Success! Created gestores-membros"

- [ ] **Step 2: Install additional dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npm install --save-dev jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom @types/jest ts-jest
```

- [ ] **Step 3: Write `jest.config.ts`**

```typescript
// jest.config.ts
import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterFramework: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
}

export default createJestConfig(config)
```

- [ ] **Step 4: Write `jest.setup.ts`**

```typescript
// jest.setup.ts
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Replace `tailwind.config.ts`**

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        surface: '#111111',
        border: '#222222',
        muted: '#a1a1aa',
        accent: '#3b82f6',
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 6: Write `.env.local.example`**

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_EMAIL=your@email.com
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 7: Create `.env.local` from example**

```bash
cp .env.local.example .env.local
```

Fill in real values from your Supabase project settings. `ADMIN_EMAIL` = your own email.

- [ ] **Step 8: Verify dev server starts**

```bash
npm run dev
```

Expected: "Ready on http://localhost:3000" with no errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project with dependencies and tooling"
```

---

### Task 2: TypeScript types and Supabase schema

**Files:**
- Create: `gestores-membros/types/db.ts`
- Create: `gestores-membros/supabase/schema.sql`

**Interfaces:**
- Produces: `Gestor`, `Modulo`, `Aula`, `Acesso` types used by all actions

- [ ] **Step 1: Write `types/db.ts`**

```typescript
// types/db.ts
export type Gestor = {
  id: string
  email: string
  nome: string | null
  created_at: string
  last_seen_at: string | null
  login_count: number
}

export type Modulo = {
  id: string
  titulo: string
  position: number
  created_at: string
}

export type Aula = {
  id: string
  titulo: string
  descricao: string | null
  panda_video_url: string
  modulo_id: string | null
  position: number
  created_at: string
}

export type Acesso = {
  id: string
  gestor_id: string
  accessed_at: string
}

export type AcessoWithGestor = Acesso & {
  gestores: Pick<Gestor, 'nome' | 'email'>
}
```

- [ ] **Step 2: Write `supabase/schema.sql`**

```sql
-- gestores-membros schema
-- Run this in Supabase SQL Editor (Project > SQL Editor > New query)

CREATE TABLE IF NOT EXISTS gestores (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text UNIQUE NOT NULL,
  nome         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  login_count  int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS modulos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo     text NOT NULL,
  position   int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS aulas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo           text NOT NULL,
  descricao        text,
  panda_video_url  text NOT NULL,
  modulo_id        uuid REFERENCES modulos(id) ON DELETE SET NULL,
  position         int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS acessos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestor_id   uuid REFERENCES gestores(id) ON DELETE CASCADE,
  accessed_at timestamptz NOT NULL DEFAULT now()
);

-- RLS enabled; all access via service_role bypasses RLS
ALTER TABLE gestores ENABLE ROW LEVEL SECURITY;
ALTER TABLE modulos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE aulas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE acessos  ENABLE ROW LEVEL SECURITY;

-- Helper function to atomically increment login_count
CREATE OR REPLACE FUNCTION increment_login_count(p_email text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE gestores
  SET login_count = login_count + 1,
      last_seen_at = now()
  WHERE email = p_email;
$$;
```

- [ ] **Step 3: Run schema in Supabase**

1. Open your Supabase project at supabase.com
2. Go to **SQL Editor** → **New query**
3. Paste the entire contents of `supabase/schema.sql`
4. Click **Run**
5. Expected: "Success. No rows returned"

> **Note:** The column is named `panda_video_url` (not `panda_video_id`) — stores the full embed URL.

- [ ] **Step 4: Commit**

```bash
git add types/db.ts supabase/schema.sql
git commit -m "feat: database types and Supabase schema"
```

---

### Task 3: Supabase client utilities

**Files:**
- Create: `gestores-membros/lib/supabase/client.ts`
- Create: `gestores-membros/lib/supabase/server.ts`
- Create: `gestores-membros/lib/supabase/service.ts`
- Create: `gestores-membros/lib/utils.ts`

**Interfaces:**
- Produces:
  - `createBrowserClient()` → Supabase client for client components
  - `createServerClient()` → Supabase client for server components/actions (async)
  - `createServiceClient()` → Supabase admin client (service role, sync)
  - `extractPandaVideoUrl(input: string): string`
  - `formatDate(iso: string | null): string`

- [ ] **Step 1: Write `lib/supabase/client.ts`**

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 2: Write `lib/supabase/server.ts`**

```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from Server Component — cookies are read-only, ignore
          }
        },
      },
    }
  )
}
```

- [ ] **Step 3: Write `lib/supabase/service.ts`**

```typescript
// lib/supabase/service.ts
import { createClient } from '@supabase/supabase-js'

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
```

- [ ] **Step 4: Write `lib/utils.ts`**

```typescript
// lib/utils.ts

/**
 * Accepts a Panda Video iframe embed code or a direct URL.
 * Returns just the URL to use as iframe src.
 */
export function extractPandaVideoUrl(input: string): string {
  const trimmed = input.trim()
  const srcMatch = trimmed.match(/src="([^"]+)"/)
  if (srcMatch) return srcMatch[1]
  return trimmed
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
```

- [ ] **Step 5: Write tests for `lib/utils.ts`**

```typescript
// __tests__/lib/utils.test.ts
import { extractPandaVideoUrl, formatDate } from '@/lib/utils'

describe('extractPandaVideoUrl', () => {
  it('extracts src from full iframe code', () => {
    const iframe = `<iframe id="panda-abc" src="https://player-vz-123.tv.pandavideo.com.br/embed/?v=uuid-here" style="border:none;" allow="autoplay"></iframe>`
    expect(extractPandaVideoUrl(iframe)).toBe(
      'https://player-vz-123.tv.pandavideo.com.br/embed/?v=uuid-here'
    )
  })

  it('returns URL unchanged when already a URL', () => {
    const url = 'https://player-vz-123.tv.pandavideo.com.br/embed/?v=uuid-here'
    expect(extractPandaVideoUrl(url)).toBe(url)
  })

  it('trims whitespace', () => {
    const url = '  https://player-vz-123.tv.pandavideo.com.br/embed/?v=abc  '
    expect(extractPandaVideoUrl(url)).toBe(
      'https://player-vz-123.tv.pandavideo.com.br/embed/?v=abc'
    )
  })
})

describe('formatDate', () => {
  it('returns — for null', () => {
    expect(formatDate(null)).toBe('—')
  })

  it('returns formatted date string for valid ISO', () => {
    const result = formatDate('2026-06-26T10:00:00Z')
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/)
  })
})
```

- [ ] **Step 6: Run tests**

```bash
npm test -- --testPathPattern=utils
```

Expected: 4 tests pass

- [ ] **Step 7: Commit**

```bash
git add lib/ __tests__/ types/
git commit -m "feat: Supabase clients and utility functions"
```

---

### Task 4: Middleware — route protection

**Files:**
- Create: `gestores-membros/middleware.ts`

**Interfaces:**
- Consumes: `ADMIN_EMAIL` env var, Supabase session cookie
- Produces: redirects enforced for `/aulas/*`, `/admin/*`, `/login`

- [ ] **Step 1: Write `middleware.ts`**

```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const adminEmail = process.env.ADMIN_EMAIL

  if (path.startsWith('/admin')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    if (user.email !== adminEmail) {
      return NextResponse.redirect(new URL('/aulas', request.url))
    }
    return supabaseResponse
  }

  if (path.startsWith('/aulas')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return supabaseResponse
  }

  if (path === '/login' && user) {
    const dest = user.email === adminEmail ? '/admin' : '/aulas'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: middleware for route protection"
```

---

### Task 5: Auth callback route and sendMagicLink action

**Files:**
- Create: `gestores-membros/app/auth/callback/route.ts`
- Create: `gestores-membros/lib/actions/auth.ts`
- Create: `gestores-membros/__tests__/lib/actions/auth.test.ts`

**Interfaces:**
- Produces:
  - `sendMagicLink(email: string): Promise<{ error?: string }>`
  - GET `/auth/callback` → exchanges code for session, updates gestor stats, redirects

- [ ] **Step 1: Write `app/auth/callback/route.ts`**

```typescript
// app/auth/callback/route.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', origin))
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(new URL('/login?error=auth', origin))
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user?.email) {
    const service = createServiceClient()

    // Atomically update last_seen_at and login_count
    await service.rpc('increment_login_count', { p_email: user.email })

    // Insert access log (only for gestores, not admin)
    const { data: gestor } = await service
      .from('gestores')
      .select('id')
      .eq('email', user.email)
      .maybeSingle()

    if (gestor) {
      await service.from('acessos').insert({ gestor_id: gestor.id })
    }
  }

  const adminEmail = process.env.ADMIN_EMAIL
  const dest = user?.email === adminEmail ? '/admin' : '/aulas'
  return NextResponse.redirect(new URL(dest, origin))
}
```

- [ ] **Step 2: Write `lib/actions/auth.ts`**

```typescript
// lib/actions/auth.ts
'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/service'

export async function sendMagicLink(
  email: string
): Promise<{ error?: string; success?: boolean }> {
  const normalizedEmail = email.toLowerCase().trim()

  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { error: 'Email inválido.' }
  }

  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase()
  const isAdmin = normalizedEmail === adminEmail

  if (!isAdmin) {
    const service = createServiceClient()
    const { data } = await service
      .from('gestores')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (!data) {
      return { error: 'Acesso não autorizado.' }
    }
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  })

  if (error) {
    return { error: 'Erro ao enviar email. Tente novamente.' }
  }

  return { success: true }
}
```

- [ ] **Step 3: Write tests for `sendMagicLink`**

```typescript
// __tests__/lib/actions/auth.test.ts
import { sendMagicLink } from '@/lib/actions/auth'

jest.mock('@/lib/supabase/service', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

jest.mock('next/headers', () => ({
  cookies: jest.fn(() => Promise.resolve({ getAll: () => [], set: jest.fn() })),
}))

const { createServiceClient } = require('@/lib/supabase/service')
const { createServerClient } = require('@supabase/ssr')

function makeServiceMock(gestorData: { id: string } | null) {
  return {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(() => Promise.resolve({ data: gestorData })),
        })),
      })),
    })),
  }
}

function makeSupabaseMock(otpError: Error | null = null) {
  return {
    auth: {
      signInWithOtp: jest.fn(() => Promise.resolve({ error: otpError })),
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.ADMIN_EMAIL = 'admin@test.com'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
})

describe('sendMagicLink', () => {
  it('returns error for invalid email', async () => {
    const result = await sendMagicLink('notanemail')
    expect(result.error).toBe('Email inválido.')
  })

  it('returns error when email not in gestores and not admin', async () => {
    createServiceClient.mockReturnValue(makeServiceMock(null))
    createServerClient.mockReturnValue(makeSupabaseMock())
    const result = await sendMagicLink('unknown@test.com')
    expect(result.error).toBe('Acesso não autorizado.')
  })

  it('sends magic link when email is in gestores', async () => {
    createServiceClient.mockReturnValue(makeServiceMock({ id: 'gestor-1' }))
    const mockSignIn = jest.fn(() => Promise.resolve({ error: null }))
    createServerClient.mockReturnValue({ auth: { signInWithOtp: mockSignIn } })
    const result = await sendMagicLink('gestor@test.com')
    expect(result.success).toBe(true)
    expect(mockSignIn).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'gestor@test.com' })
    )
  })

  it('sends magic link when email is admin (skips DB check)', async () => {
    const mockSignIn = jest.fn(() => Promise.resolve({ error: null }))
    createServerClient.mockReturnValue({ auth: { signInWithOtp: mockSignIn } })
    const result = await sendMagicLink('admin@test.com')
    expect(result.success).toBe(true)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns error when Supabase OTP fails', async () => {
    createServiceClient.mockReturnValue(makeServiceMock({ id: 'g-1' }))
    createServerClient.mockReturnValue(
      makeSupabaseMock(new Error('rate limited'))
    )
    const result = await sendMagicLink('gestor@test.com')
    expect(result.error).toBe('Erro ao enviar email. Tente novamente.')
  })
})
```

- [ ] **Step 4: Run auth tests**

```bash
npm test -- --testPathPattern=auth
```

Expected: 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add app/auth/ lib/actions/auth.ts __tests__/
git commit -m "feat: auth callback route and sendMagicLink server action"
```

---

### Task 6: Root layout, globals, and login page

**Files:**
- Modify: `gestores-membros/app/globals.css`
- Modify: `gestores-membros/app/layout.tsx`
- Create: `gestores-membros/app/page.tsx`
- Create: `gestores-membros/components/LoginForm.tsx`
- Create: `gestores-membros/app/login/page.tsx`
- Create: `gestores-membros/__tests__/components/LoginForm.test.tsx`

**Interfaces:**
- Consumes: `sendMagicLink(email): Promise<{error?, success?}>` from `@/lib/actions/auth`
- Produces: `/login` renders login form; success state shows "Verifique seu email"

- [ ] **Step 1: Replace `app/globals.css`**

```css
/* app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark;
}

* {
  box-sizing: border-box;
}

body {
  background-color: #0a0a0a;
  color: #ffffff;
  font-family: var(--font-geist-sans), system-ui, sans-serif;
}
```

- [ ] **Step 2: Replace `app/layout.tsx`**

```tsx
// app/layout.tsx
import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  title: 'Trafego / BORDERLESS',
  description: 'Área de membros exclusiva para gestores',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className={geist.variable}>
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Write `app/page.tsx`**

```tsx
// app/page.tsx
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/login')
}
```

- [ ] **Step 4: Write `components/LoginForm.tsx`**

```tsx
// components/LoginForm.tsx
'use client'

import { useState, useTransition } from 'react'
import { sendMagicLink } from '@/lib/actions/auth'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await sendMagicLink(email)
      if (result.error) {
        setError(result.error)
      } else {
        setSent(true)
      }
    })
  }

  if (sent) {
    return (
      <div className="text-center">
        <div className="text-4xl mb-4">✉️</div>
        <h2 className="text-xl font-semibold mb-2">Verifique seu email</h2>
        <p className="text-muted text-sm">
          Enviamos um link de acesso para <strong>{email}</strong>.<br />
          Clique no link para entrar.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm text-muted">
          Seu email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com"
          required
          disabled={isPending}
          className="bg-surface border border-border rounded-lg px-4 py-3 text-sm text-white placeholder-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
        />
      </div>

      {error && (
        <p role="alert" className="text-red-400 text-sm">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || !email}
        className="bg-accent hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg text-sm transition-colors"
      >
        {isPending ? 'Enviando...' : 'Entrar com magic link'}
      </button>
    </form>
  )
}
```

- [ ] **Step 5: Write `app/login/page.tsx`**

```tsx
// app/login/page.tsx
import LoginForm from '@/components/LoginForm'

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold tracking-tight">
            Trafego{' '}
            <span className="text-muted font-normal">/ BORDERLESS</span>
          </h1>
          <p className="text-muted text-sm mt-2">Área exclusiva para gestores</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-8">
          <LoginForm />
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 6: Write tests for `LoginForm`**

```tsx
// __tests__/components/LoginForm.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LoginForm from '@/components/LoginForm'

jest.mock('@/lib/actions/auth', () => ({
  sendMagicLink: jest.fn(),
}))

const { sendMagicLink } = require('@/lib/actions/auth')

beforeEach(() => jest.clearAllMocks())

describe('LoginForm', () => {
  it('renders email input and submit button', () => {
    render(<LoginForm />)
    expect(screen.getByLabelText(/seu email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument()
  })

  it('shows success state after magic link sent', async () => {
    sendMagicLink.mockResolvedValue({ success: true })
    render(<LoginForm />)
    fireEvent.change(screen.getByLabelText(/seu email/i), {
      target: { value: 'test@example.com' },
    })
    fireEvent.submit(screen.getByRole('button', { name: /entrar/i }))
    await waitFor(() => {
      expect(screen.getByText(/verifique seu email/i)).toBeInTheDocument()
    })
  })

  it('shows error message on failure', async () => {
    sendMagicLink.mockResolvedValue({ error: 'Acesso não autorizado.' })
    render(<LoginForm />)
    fireEvent.change(screen.getByLabelText(/seu email/i), {
      target: { value: 'unknown@example.com' },
    })
    fireEvent.submit(screen.getByRole('button', { name: /entrar/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Acesso não autorizado.')
    })
  })
})
```

- [ ] **Step 7: Run component tests**

```bash
npm test -- --testPathPattern=LoginForm
```

Expected: 3 tests pass

- [ ] **Step 8: Verify login page visually**

```bash
npm run dev
```

Open http://localhost:3000/login — expect dark background, centered card, "Trafego / BORDERLESS" heading, email input.

- [ ] **Step 9: Commit**

```bash
git add app/ components/LoginForm.tsx __tests__/
git commit -m "feat: login page with magic link form"
```

---

### Task 7: Member area — aulas list and video player

**Files:**
- Create: `gestores-membros/lib/actions/aulas.ts` (read functions only)
- Create: `gestores-membros/components/AulaCard.tsx`
- Create: `gestores-membros/components/ModuloSection.tsx`
- Create: `gestores-membros/components/VideoPlayer.tsx`
- Create: `gestores-membros/app/aulas/page.tsx`
- Create: `gestores-membros/app/aulas/[id]/page.tsx`
- Create: `gestores-membros/__tests__/components/VideoPlayer.test.tsx`

**Interfaces:**
- Consumes: `Aula`, `Modulo` types from `@/types/db`
- Produces:
  - `getAulas(): Promise<Aula[]>`
  - `getModulos(): Promise<Modulo[]>`
  - `getAulaById(id: string): Promise<Aula | null>`
  - `<VideoPlayer url={string} title={string} />`

- [ ] **Step 1: Write `lib/actions/aulas.ts` (read only — writes added in Task 12)**

```typescript
// lib/actions/aulas.ts
'use server'

import { createServiceClient } from '@/lib/supabase/service'
import type { Aula, Modulo } from '@/types/db'

export async function getModulos(): Promise<Modulo[]> {
  const db = createServiceClient()
  const { data, error } = await db
    .from('modulos')
    .select('*')
    .order('position', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getAulas(): Promise<Aula[]> {
  const db = createServiceClient()
  const { data, error } = await db
    .from('aulas')
    .select('*')
    .order('position', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getAulaById(id: string): Promise<Aula | null> {
  const db = createServiceClient()
  const { data } = await db
    .from('aulas')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  return data
}
```

- [ ] **Step 2: Write `components/AulaCard.tsx`**

```tsx
// components/AulaCard.tsx
import Link from 'next/link'
import type { Aula } from '@/types/db'

export default function AulaCard({ aula }: { aula: Aula }) {
  return (
    <Link
      href={`/aulas/${aula.id}`}
      className="block bg-surface border border-border rounded-lg p-4 hover:border-accent transition-colors group"
    >
      <h3 className="font-medium text-sm group-hover:text-accent transition-colors">
        {aula.titulo}
      </h3>
      {aula.descricao && (
        <p className="text-muted text-xs mt-1 line-clamp-2">{aula.descricao}</p>
      )}
    </Link>
  )
}
```

- [ ] **Step 3: Write `components/ModuloSection.tsx`**

```tsx
// components/ModuloSection.tsx
import AulaCard from './AulaCard'
import type { Aula, Modulo } from '@/types/db'

type Props = {
  modulo: Modulo | null
  aulas: Aula[]
}

export default function ModuloSection({ modulo, aulas }: Props) {
  if (aulas.length === 0) return null
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
        {modulo?.titulo ?? 'Sem módulo'}
      </h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {aulas.map((aula) => (
          <AulaCard key={aula.id} aula={aula} />
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Write `components/VideoPlayer.tsx`**

```tsx
// components/VideoPlayer.tsx
'use client'

type Props = {
  url: string
  title: string
}

export default function VideoPlayer({ url, title }: Props) {
  return (
    <div className="w-full aspect-video rounded-xl overflow-hidden bg-black">
      <iframe
        src={url}
        title={title}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        className="w-full h-full border-0"
      />
    </div>
  )
}
```

- [ ] **Step 5: Write `app/aulas/page.tsx`**

```tsx
// app/aulas/page.tsx
import { getAulas, getModulos } from '@/lib/actions/aulas'
import ModuloSection from '@/components/ModuloSection'
import type { Aula, Modulo } from '@/types/db'
import Link from 'next/link'

export default async function AulasPage() {
  const [modulos, aulas] = await Promise.all([getModulos(), getAulas()])

  // Group aulas by modulo_id
  const byModulo = new Map<string | null, Aula[]>()
  aulas.forEach((aula) => {
    const key = aula.modulo_id ?? null
    if (!byModulo.has(key)) byModulo.set(key, [])
    byModulo.get(key)!.push(aula)
  })

  // Sections: each modulo in order, then unassigned
  const sections: { modulo: Modulo | null; aulas: Aula[] }[] = [
    ...modulos.map((m) => ({ modulo: m, aulas: byModulo.get(m.id) ?? [] })),
    { modulo: null, aulas: byModulo.get(null) ?? [] },
  ]

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <h1 className="font-bold text-lg">
          Trafego <span className="text-muted font-normal">/ BORDERLESS</span>
        </h1>
        <form action="/auth/signout" method="post">
          <button className="text-muted text-sm hover:text-white transition-colors">
            Sair
          </button>
        </form>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 flex flex-col gap-10">
        <div>
          <h2 className="text-2xl font-bold">Aulas</h2>
          <p className="text-muted text-sm mt-1">
            {aulas.length} aula{aulas.length !== 1 ? 's' : ''} disponíve
            {aulas.length !== 1 ? 'is' : 'l'}
          </p>
        </div>

        {aulas.length === 0 ? (
          <p className="text-muted text-sm">Nenhuma aula disponível ainda.</p>
        ) : (
          sections.map((section, i) => (
            <ModuloSection
              key={section.modulo?.id ?? 'unassigned'}
              modulo={section.modulo}
              aulas={section.aulas}
            />
          ))
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 6: Add signout route**

```typescript
// app/auth/signout/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(
    new URL('/login', process.env.NEXT_PUBLIC_APP_URL!)
  )
}
```

- [ ] **Step 7: Write `app/aulas/[id]/page.tsx`**

```tsx
// app/aulas/[id]/page.tsx
import { getAulaById, getAulas } from '@/lib/actions/aulas'
import VideoPlayer from '@/components/VideoPlayer'
import Link from 'next/link'
import { notFound } from 'next/navigation'

type Props = { params: Promise<{ id: string }> }

export default async function AulaPage({ params }: Props) {
  const { id } = await params
  const aula = await getAulaById(id)
  if (!aula) notFound()

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-4 flex items-center gap-4">
        <Link
          href="/aulas"
          className="text-muted text-sm hover:text-white transition-colors"
        >
          ← Voltar
        </Link>
        <h1 className="font-bold text-lg">
          Trafego <span className="text-muted font-normal">/ BORDERLESS</span>
        </h1>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold mb-6">{aula.titulo}</h2>
        <VideoPlayer url={aula.panda_video_url} title={aula.titulo} />
        {aula.descricao && (
          <p className="text-muted text-sm mt-6 leading-relaxed">{aula.descricao}</p>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 8: Write VideoPlayer tests**

```tsx
// __tests__/components/VideoPlayer.test.tsx
import { render, screen } from '@testing-library/react'
import VideoPlayer from '@/components/VideoPlayer'

describe('VideoPlayer', () => {
  it('renders an iframe with the correct src', () => {
    const url = 'https://player-vz-123.tv.pandavideo.com.br/embed/?v=abc'
    render(<VideoPlayer url={url} title="Aula 1" />)
    const iframe = screen.getByTitle('Aula 1')
    expect(iframe).toBeInTheDocument()
    expect(iframe).toHaveAttribute('src', url)
  })

  it('renders iframe with allowFullScreen', () => {
    render(
      <VideoPlayer
        url="https://player-vz-123.tv.pandavideo.com.br/embed/?v=abc"
        title="Test"
      />
    )
    const iframe = screen.getByTitle('Test')
    expect(iframe).toHaveAttribute('allowFullscreen')
  })
})
```

- [ ] **Step 9: Run tests**

```bash
npm test -- --testPathPattern=VideoPlayer
```

Expected: 2 tests pass

- [ ] **Step 10: Verify member area visually**

Start dev server, log in as a gestor (add your email to `gestores` table in Supabase first), click the magic link, navigate to `/aulas`. Verify cards and layout.

- [ ] **Step 11: Commit**

```bash
git add app/aulas/ app/auth/signout/ components/ lib/actions/aulas.ts __tests__/
git commit -m "feat: member area — aulas list and video player"
```

---

### Task 8: Admin layout and dashboard

**Files:**
- Create: `gestores-membros/app/admin/layout.tsx`
- Create: `gestores-membros/components/admin/AdminNav.tsx`
- Create: `gestores-membros/lib/actions/gestores.ts` (stats only — full CRUD in Task 9)
- Create: `gestores-membros/app/admin/page.tsx`

**Interfaces:**
- Produces:
  - `getAdminStats(): Promise<{ totalGestores, activeGestores, totalAulas, totalModulos, recentAcessos }>`
  - `/admin` renders dashboard with stat cards and recent access table

- [ ] **Step 1: Write `components/admin/AdminNav.tsx`**

```tsx
// components/admin/AdminNav.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/gestores', label: 'Gestores' },
  { href: '/admin/modulos', label: 'Módulos' },
  { href: '/admin/aulas', label: 'Aulas' },
]

export default function AdminNav() {
  const pathname = usePathname()
  return (
    <nav className="flex gap-1">
      {links.map((link) => {
        const active =
          link.href === '/admin'
            ? pathname === '/admin'
            : pathname.startsWith(link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              active
                ? 'bg-accent text-white'
                : 'text-muted hover:text-white hover:bg-surface'
            }`}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2: Write `app/admin/layout.tsx`**

```tsx
// app/admin/layout.tsx
import AdminNav from '@/components/admin/AdminNav'
import Link from 'next/link'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#080808]">
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold text-sm">
            Admin <span className="text-muted font-normal">/ BORDERLESS</span>
          </span>
          <AdminNav />
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/aulas"
            className="text-muted text-xs hover:text-white transition-colors"
          >
            Ver área de aulas →
          </Link>
          <form action="/auth/signout" method="post">
            <button className="text-muted text-xs hover:text-white transition-colors">
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Write stats query in `lib/actions/gestores.ts`**

```typescript
// lib/actions/gestores.ts
'use server'

import { createServiceClient } from '@/lib/supabase/service'
import type { Gestor, AcessoWithGestor } from '@/types/db'

export type AdminStats = {
  totalGestores: number
  activeGestores: number
  totalAulas: number
  totalModulos: number
  recentAcessos: AcessoWithGestor[]
}

export async function getAdminStats(): Promise<AdminStats> {
  const db = createServiceClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { count: totalGestores },
    { count: activeGestores },
    { count: totalAulas },
    { count: totalModulos },
    { data: recentAcessos },
  ] = await Promise.all([
    db.from('gestores').select('*', { count: 'exact', head: true }),
    db
      .from('gestores')
      .select('*', { count: 'exact', head: true })
      .gte('last_seen_at', thirtyDaysAgo),
    db.from('aulas').select('*', { count: 'exact', head: true }),
    db.from('modulos').select('*', { count: 'exact', head: true }),
    db
      .from('acessos')
      .select('*, gestores(nome, email)')
      .order('accessed_at', { ascending: false })
      .limit(20),
  ])

  return {
    totalGestores: totalGestores ?? 0,
    activeGestores: activeGestores ?? 0,
    totalAulas: totalAulas ?? 0,
    totalModulos: totalModulos ?? 0,
    recentAcessos: (recentAcessos ?? []) as AcessoWithGestor[],
  }
}
```

- [ ] **Step 4: Write `app/admin/page.tsx`**

```tsx
// app/admin/page.tsx
import { getAdminStats } from '@/lib/actions/gestores'
import { formatDate } from '@/lib/utils'

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <p className="text-muted text-xs uppercase tracking-widest mb-1">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  )
}

export default async function AdminDashboard() {
  const stats = await getAdminStats()

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted text-sm mt-1">Visão geral da plataforma</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Gestores cadastrados" value={stats.totalGestores} />
        <StatCard label="Ativos (30 dias)" value={stats.activeGestores} />
        <StatCard label="Total de aulas" value={stats.totalAulas} />
        <StatCard label="Módulos" value={stats.totalModulos} />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">Últimos acessos</h2>
        {stats.recentAcessos.length === 0 ? (
          <p className="text-muted text-sm">Nenhum acesso registrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted text-xs uppercase tracking-widest">
                  <th className="pb-3 pr-6">Gestor</th>
                  <th className="pb-3 pr-6">Email</th>
                  <th className="pb-3">Data</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentAcessos.map((acesso) => (
                  <tr
                    key={acesso.id}
                    className="border-b border-border/50 hover:bg-surface/50 transition-colors"
                  >
                    <td className="py-3 pr-6">
                      {acesso.gestores?.nome ?? '—'}
                    </td>
                    <td className="py-3 pr-6 text-muted">
                      {acesso.gestores?.email}
                    </td>
                    <td className="py-3 text-muted">
                      {formatDate(acesso.accessed_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verify admin dashboard**

```bash
npm run dev
```

Log in with your admin email and visit http://localhost:3000/admin. Verify: stat cards show 0s, "últimos acessos" table renders.

- [ ] **Step 6: Commit**

```bash
git add app/admin/ components/admin/AdminNav.tsx lib/actions/gestores.ts
git commit -m "feat: admin layout and dashboard"
```

---

### Task 9: Admin — Gestores CRUD

**Files:**
- Modify: `gestores-membros/lib/actions/gestores.ts` (add CRUD)
- Create: `gestores-membros/components/admin/GestoresTable.tsx`
- Create: `gestores-membros/app/admin/gestores/page.tsx`

**Interfaces:**
- Consumes: `Gestor` type
- Produces:
  - `getGestores(): Promise<Gestor[]>`
  - `addGestor(nome: string, email: string): Promise<{ error?: string }>`
  - `removeGestor(id: string): Promise<void>`

- [ ] **Step 1: Add CRUD functions to `lib/actions/gestores.ts`**

Append to the existing file (after `getAdminStats`):

```typescript
export async function getGestores(): Promise<Gestor[]> {
  const db = createServiceClient()
  const { data, error } = await db
    .from('gestores')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function addGestor(
  nome: string,
  email: string
): Promise<{ error?: string }> {
  const normalizedEmail = email.toLowerCase().trim()
  if (!normalizedEmail.includes('@')) return { error: 'Email inválido.' }

  const db = createServiceClient()
  const { error } = await db
    .from('gestores')
    .insert({ nome: nome.trim() || null, email: normalizedEmail })

  if (error?.code === '23505') return { error: 'Email já cadastrado.' }
  if (error) return { error: 'Erro ao cadastrar gestor.' }
  return {}
}

export async function removeGestor(id: string): Promise<void> {
  const db = createServiceClient()
  await db.from('gestores').delete().eq('id', id)
}
```

- [ ] **Step 2: Write `components/admin/GestoresTable.tsx`**

```tsx
// components/admin/GestoresTable.tsx
'use client'

import { useState, useTransition } from 'react'
import { addGestor, removeGestor } from '@/lib/actions/gestores'
import { formatDate } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import type { Gestor } from '@/types/db'

export default function GestoresTable({ gestores }: { gestores: Gestor[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showModal, setShowModal] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    startTransition(async () => {
      const result = await addGestor(nome, email)
      if (result.error) {
        setFormError(result.error)
        return
      }
      setNome('')
      setEmail('')
      setShowModal(false)
      router.refresh()
    })
  }

  function handleRemove(id: string, email: string) {
    if (!confirm(`Remover acesso de ${email}?`)) return
    startTransition(async () => {
      await removeGestor(id)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-muted text-sm">{gestores.length} gestores cadastrados</p>
        <button
          onClick={() => setShowModal(true)}
          className="bg-accent hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Adicionar gestor
        </button>
      </div>

      {gestores.length === 0 ? (
        <p className="text-muted text-sm">Nenhum gestor cadastrado ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted text-xs uppercase tracking-widest">
                <th className="pb-3 pr-6">Nome</th>
                <th className="pb-3 pr-6">Email</th>
                <th className="pb-3 pr-6">Cadastrado em</th>
                <th className="pb-3 pr-6">Último acesso</th>
                <th className="pb-3 pr-6">Acessos</th>
                <th className="pb-3" />
              </tr>
            </thead>
            <tbody>
              {gestores.map((g) => (
                <tr
                  key={g.id}
                  className="border-b border-border/50 hover:bg-surface/50 transition-colors"
                >
                  <td className="py-3 pr-6">{g.nome ?? '—'}</td>
                  <td className="py-3 pr-6 text-muted">{g.email}</td>
                  <td className="py-3 pr-6 text-muted">{formatDate(g.created_at)}</td>
                  <td className="py-3 pr-6 text-muted">{formatDate(g.last_seen_at)}</td>
                  <td className="py-3 pr-6 text-muted">{g.login_count}</td>
                  <td className="py-3">
                    <button
                      onClick={() => handleRemove(g.id, g.email)}
                      disabled={isPending}
                      className="text-red-400 hover:text-red-300 text-xs disabled:opacity-40 transition-colors"
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md mx-4">
            <h2 className="font-semibold mb-4">Adicionar gestor</h2>
            <form onSubmit={handleAdd} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-muted">Nome (opcional)</label>
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Nome do gestor"
                  className="bg-background border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-muted">Email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="gestor@email.com"
                  required
                  className="bg-background border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent"
                />
              </div>
              {formError && (
                <p className="text-red-400 text-sm">{formError}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setFormError(null) }}
                  className="flex-1 border border-border text-sm py-2.5 rounded-lg hover:bg-border/50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending || !email}
                  className="flex-1 bg-accent hover:bg-blue-500 disabled:opacity-40 text-white text-sm py-2.5 rounded-lg transition-colors"
                >
                  {isPending ? 'Salvando...' : 'Adicionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Write `app/admin/gestores/page.tsx`**

```tsx
// app/admin/gestores/page.tsx
import { getGestores } from '@/lib/actions/gestores'
import GestoresTable from '@/components/admin/GestoresTable'

export default async function AdminGestoresPage() {
  const gestores = await getGestores()
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Gestores</h1>
        <p className="text-muted text-sm mt-1">
          Gerencie quem tem acesso à plataforma
        </p>
      </div>
      <GestoresTable gestores={gestores} />
    </div>
  )
}
```

- [ ] **Step 4: Verify gestores page**

Visit http://localhost:3000/admin/gestores. Add a gestor, verify it appears in the table. Click Remover, confirm deletion.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/gestores.ts components/admin/GestoresTable.tsx app/admin/gestores/
git commit -m "feat: admin gestores CRUD"
```

---

### Task 10: Admin — Módulos CRUD with drag-to-reorder

**Files:**
- Create: `gestores-membros/lib/actions/modulos.ts`
- Create: `gestores-membros/components/admin/ModulosManager.tsx`
- Create: `gestores-membros/app/admin/modulos/page.tsx`

**Interfaces:**
- Produces:
  - `getModulosAdmin(): Promise<Modulo[]>`
  - `createModulo(titulo: string): Promise<{ error?: string }>`
  - `updateModulo(id: string, titulo: string): Promise<void>`
  - `deleteModulo(id: string): Promise<void>`
  - `reorderModulos(ids: string[]): Promise<void>`

- [ ] **Step 1: Write `lib/actions/modulos.ts`**

```typescript
// lib/actions/modulos.ts
'use server'

import { createServiceClient } from '@/lib/supabase/service'
import type { Modulo } from '@/types/db'

export async function getModulosAdmin(): Promise<Modulo[]> {
  const db = createServiceClient()
  const { data, error } = await db
    .from('modulos')
    .select('*')
    .order('position', { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createModulo(
  titulo: string
): Promise<{ error?: string }> {
  if (!titulo.trim()) return { error: 'Título obrigatório.' }
  const db = createServiceClient()
  const { data: last } = await db
    .from('modulos')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextPosition = (last?.position ?? -1) + 1
  const { error } = await db
    .from('modulos')
    .insert({ titulo: titulo.trim(), position: nextPosition })
  if (error) return { error: 'Erro ao criar módulo.' }
  return {}
}

export async function updateModulo(id: string, titulo: string): Promise<void> {
  const db = createServiceClient()
  await db.from('modulos').update({ titulo: titulo.trim() }).eq('id', id)
}

export async function deleteModulo(id: string): Promise<void> {
  const db = createServiceClient()
  // Aulas with this modulo_id will have modulo_id set to null (ON DELETE SET NULL)
  await db.from('modulos').delete().eq('id', id)
}

export async function reorderModulos(ids: string[]): Promise<void> {
  const db = createServiceClient()
  await Promise.all(
    ids.map((id, index) =>
      db.from('modulos').update({ position: index }).eq('id', id)
    )
  )
}
```

- [ ] **Step 2: Write `components/admin/ModulosManager.tsx`**

```tsx
// components/admin/ModulosManager.tsx
'use client'

import { useState, useTransition } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  createModulo,
  updateModulo,
  deleteModulo,
  reorderModulos,
} from '@/lib/actions/modulos'
import { useRouter } from 'next/navigation'
import type { Modulo } from '@/types/db'

function SortableModulo({
  modulo,
  onRename,
  onDelete,
}: {
  modulo: Modulo
  onRename: (id: string, titulo: string) => void
  onDelete: (id: string, titulo: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: modulo.id })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(modulo.titulo)

  function commitRename() {
    if (draft.trim() && draft.trim() !== modulo.titulo) {
      onRename(modulo.id, draft.trim())
    }
    setEditing(false)
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-3 bg-surface border border-border rounded-lg px-4 py-3"
    >
      <span
        {...attributes}
        {...listeners}
        className="text-muted cursor-grab active:cursor-grabbing text-lg select-none"
        title="Arraste para reordenar"
      >
        ⠿
      </span>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') { setDraft(modulo.titulo); setEditing(false) }
          }}
          className="flex-1 bg-background border border-accent rounded px-2 py-1 text-sm focus:outline-none"
        />
      ) : (
        <span
          className="flex-1 text-sm cursor-pointer hover:text-accent transition-colors"
          onClick={() => setEditing(true)}
          title="Clique para renomear"
        >
          {modulo.titulo}
        </span>
      )}

      <button
        onClick={() => onDelete(modulo.id, modulo.titulo)}
        className="text-red-400 hover:text-red-300 text-xs transition-colors"
      >
        Deletar
      </button>
    </div>
  )
}

export default function ModulosManager({ modulos: initial }: { modulos: Modulo[] }) {
  const router = useRouter()
  const [modulos, setModulos] = useState(initial)
  const [newTitulo, setNewTitulo] = useState('')
  const [isPending, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = modulos.findIndex((m) => m.id === active.id)
    const newIndex = modulos.findIndex((m) => m.id === over.id)
    const reordered = arrayMove(modulos, oldIndex, newIndex)
    setModulos(reordered)
    startTransition(async () => {
      await reorderModulos(reordered.map((m) => m.id))
    })
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitulo.trim()) return
    startTransition(async () => {
      await createModulo(newTitulo.trim())
      setNewTitulo('')
      router.refresh()
    })
  }

  function handleRename(id: string, titulo: string) {
    startTransition(async () => {
      await updateModulo(id, titulo)
      setModulos((prev) =>
        prev.map((m) => (m.id === id ? { ...m, titulo } : m))
      )
    })
  }

  function handleDelete(id: string, titulo: string) {
    if (!confirm(`Deletar módulo "${titulo}"? As aulas dentro dele ficarão sem módulo.`)) return
    startTransition(async () => {
      await deleteModulo(id)
      setModulos((prev) => prev.filter((m) => m.id !== id))
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleCreate} className="flex gap-3">
        <input
          type="text"
          value={newTitulo}
          onChange={(e) => setNewTitulo(e.target.value)}
          placeholder="Nome do novo módulo"
          className="flex-1 bg-surface border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={isPending || !newTitulo.trim()}
          className="bg-accent hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap"
        >
          + Criar módulo
        </button>
      </form>

      {modulos.length === 0 ? (
        <p className="text-muted text-sm">Nenhum módulo criado ainda.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={modulos.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2">
              {modulos.map((m) => (
                <SortableModulo
                  key={m.id}
                  modulo={m}
                  onRename={handleRename}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Write `app/admin/modulos/page.tsx`**

```tsx
// app/admin/modulos/page.tsx
import { getModulosAdmin } from '@/lib/actions/modulos'
import ModulosManager from '@/components/admin/ModulosManager'

export default async function AdminModulosPage() {
  const modulos = await getModulosAdmin()
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Módulos</h1>
        <p className="text-muted text-sm mt-1">
          Arraste para reordenar. Clique no nome para renomear.
        </p>
      </div>
      <ModulosManager modulos={modulos} />
    </div>
  )
}
```

- [ ] **Step 4: Verify módulos page**

Visit http://localhost:3000/admin/modulos. Create two modules, drag to reorder, rename one, delete one. Verify persists after page refresh.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/modulos.ts components/admin/ModulosManager.tsx app/admin/modulos/
git commit -m "feat: admin modules CRUD with drag-to-reorder"
```

---

### Task 11: Admin — Aulas CRUD

**Files:**
- Modify: `gestores-membros/lib/actions/aulas.ts` (add write functions)
- Create: `gestores-membros/components/admin/AulasManager.tsx`
- Create: `gestores-membros/app/admin/aulas/page.tsx`

**Interfaces:**
- Consumes: `extractPandaVideoUrl` from `@/lib/utils`
- Produces:
  - `createAula(titulo, descricao, pandaInput, moduloId): Promise<{error?}>`
  - `updateAula(id, titulo, descricao, pandaInput, moduloId): Promise<{error?}>`
  - `deleteAula(id): Promise<void>`
  - `reorderAulas(ids: string[]): Promise<void>`

- [ ] **Step 1: Add write functions to `lib/actions/aulas.ts`**

First, add this import to the **top** of the file (after the existing imports):

```typescript
import { extractPandaVideoUrl } from '@/lib/utils'
```

Then append these functions **after** the existing read functions:

```typescript

export async function createAula(
  titulo: string,
  descricao: string,
  pandaInput: string,
  moduloId: string | null
): Promise<{ error?: string }> {
  if (!titulo.trim()) return { error: 'Título obrigatório.' }
  if (!pandaInput.trim()) return { error: 'URL do vídeo obrigatória.' }

  const panda_video_url = extractPandaVideoUrl(pandaInput)
  const db = createServiceClient()

  const { data: last } = await db
    .from('aulas')
    .select('position')
    .eq('modulo_id', moduloId ?? null)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPosition = (last?.position ?? -1) + 1

  const { error } = await db.from('aulas').insert({
    titulo: titulo.trim(),
    descricao: descricao.trim() || null,
    panda_video_url,
    modulo_id: moduloId || null,
    position: nextPosition,
  })

  if (error) return { error: 'Erro ao criar aula.' }
  return {}
}

export async function updateAula(
  id: string,
  titulo: string,
  descricao: string,
  pandaInput: string,
  moduloId: string | null
): Promise<{ error?: string }> {
  if (!titulo.trim()) return { error: 'Título obrigatório.' }
  if (!pandaInput.trim()) return { error: 'URL do vídeo obrigatória.' }

  const panda_video_url = extractPandaVideoUrl(pandaInput)
  const db = createServiceClient()

  const { error } = await db
    .from('aulas')
    .update({
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      panda_video_url,
      modulo_id: moduloId || null,
    })
    .eq('id', id)

  if (error) return { error: 'Erro ao atualizar aula.' }
  return {}
}

export async function deleteAula(id: string): Promise<void> {
  const db = createServiceClient()
  await db.from('aulas').delete().eq('id', id)
}

export async function reorderAulas(ids: string[]): Promise<void> {
  const db = createServiceClient()
  await Promise.all(
    ids.map((id, index) =>
      db.from('aulas').update({ position: index }).eq('id', id)
    )
  )
}
```

- [ ] **Step 2: Write `components/admin/AulasManager.tsx`**

```tsx
// components/admin/AulasManager.tsx
'use client'

import { useState, useTransition } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  createAula,
  updateAula,
  deleteAula,
  reorderAulas,
} from '@/lib/actions/aulas'
import { useRouter } from 'next/navigation'
import type { Aula, Modulo } from '@/types/db'

type AulaFormData = {
  titulo: string
  descricao: string
  pandaInput: string
  moduloId: string
}

const emptyForm: AulaFormData = {
  titulo: '',
  descricao: '',
  pandaInput: '',
  moduloId: '',
}

function AulaFormModal({
  modulos,
  initial,
  onSubmit,
  onClose,
  isPending,
  formError,
  title,
}: {
  modulos: Modulo[]
  initial: AulaFormData
  onSubmit: (data: AulaFormData) => void
  onClose: () => void
  isPending: boolean
  formError: string | null
  title: string
}) {
  const [form, setForm] = useState(initial)
  const set = (k: keyof AulaFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }))

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="font-semibold mb-5">{title}</h2>
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit(form) }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-muted">Título *</label>
            <input
              type="text"
              value={form.titulo}
              onChange={set('titulo')}
              required
              placeholder="Título da aula"
              className="bg-background border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-muted">Descrição (opcional)</label>
            <textarea
              value={form.descricao}
              onChange={set('descricao')}
              rows={2}
              placeholder="Breve descrição da aula"
              className="bg-background border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-muted">Vídeo Panda Video *</label>
            <textarea
              value={form.pandaInput}
              onChange={set('pandaInput')}
              rows={3}
              required
              placeholder={`Cole aqui o código iframe ou a URL:\nhttps://player-vz-xxx.tv.pandavideo.com.br/embed/?v=...`}
              className="bg-background border border-border rounded-lg px-4 py-2.5 text-xs font-mono focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-muted">Módulo (opcional)</label>
            <select
              value={form.moduloId}
              onChange={set('moduloId')}
              className="bg-background border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent"
            >
              <option value="">Sem módulo</option>
              {modulos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.titulo}
                </option>
              ))}
            </select>
          </div>

          {formError && <p className="text-red-400 text-sm">{formError}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-border text-sm py-2.5 rounded-lg hover:bg-border/50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-accent hover:bg-blue-500 disabled:opacity-40 text-white text-sm py-2.5 rounded-lg transition-colors"
            >
              {isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SortableAulaCard({
  aula,
  onEdit,
  onDelete,
}: {
  aula: Aula
  onEdit: (aula: Aula) => void
  onDelete: (id: string, titulo: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: aula.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-3 bg-surface border border-border rounded-lg px-4 py-3"
    >
      <span
        {...attributes}
        {...listeners}
        className="text-muted cursor-grab active:cursor-grabbing text-lg select-none"
      >
        ⠿
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{aula.titulo}</p>
        {aula.descricao && (
          <p className="text-xs text-muted truncate mt-0.5">{aula.descricao}</p>
        )}
      </div>
      <button
        onClick={() => onEdit(aula)}
        className="text-muted hover:text-white text-xs transition-colors shrink-0"
      >
        Editar
      </button>
      <button
        onClick={() => onDelete(aula.id, aula.titulo)}
        className="text-red-400 hover:text-red-300 text-xs transition-colors shrink-0"
      >
        Deletar
      </button>
    </div>
  )
}

type Props = {
  aulas: Aula[]
  modulos: Modulo[]
}

export default function AulasManager({ aulas: initialAulas, modulos }: Props) {
  const router = useRouter()
  const [aulas, setAulas] = useState(initialAulas)
  const [showCreate, setShowCreate] = useState(false)
  const [editingAula, setEditingAula] = useState<Aula | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Group by modulo_id for display, but keep a flat sortable list per section
  const sections: { modulo: Modulo | null; items: Aula[] }[] = [
    ...modulos.map((m) => ({
      modulo: m,
      items: aulas.filter((a) => a.modulo_id === m.id),
    })),
    { modulo: null, items: aulas.filter((a) => !a.modulo_id) },
  ]

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = aulas.findIndex((a) => a.id === active.id)
    const newIndex = aulas.findIndex((a) => a.id === over.id)
    const reordered = arrayMove(aulas, oldIndex, newIndex)
    setAulas(reordered)
    startTransition(async () => {
      await reorderAulas(reordered.map((a) => a.id))
    })
  }

  function handleCreate(data: AulaFormData) {
    setFormError(null)
    startTransition(async () => {
      const result = await createAula(
        data.titulo,
        data.descricao,
        data.pandaInput,
        data.moduloId || null
      )
      if (result.error) { setFormError(result.error); return }
      setShowCreate(false)
      router.refresh()
    })
  }

  function handleUpdate(data: AulaFormData) {
    if (!editingAula) return
    setFormError(null)
    startTransition(async () => {
      const result = await updateAula(
        editingAula.id,
        data.titulo,
        data.descricao,
        data.pandaInput,
        data.moduloId || null
      )
      if (result.error) { setFormError(result.error); return }
      setEditingAula(null)
      router.refresh()
    })
  }

  function handleDelete(id: string, titulo: string) {
    if (!confirm(`Deletar aula "${titulo}"?`)) return
    startTransition(async () => {
      await deleteAula(id)
      setAulas((prev) => prev.filter((a) => a.id !== id))
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-end">
        <button
          onClick={() => setShowCreate(true)}
          className="bg-accent hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Nova aula
        </button>
      </div>

      {aulas.length === 0 ? (
        <p className="text-muted text-sm">Nenhuma aula criada ainda.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={aulas.map((a) => a.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-8">
              {sections.map((section) => {
                if (section.items.length === 0) return null
                return (
                  <div key={section.modulo?.id ?? 'unassigned'}>
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">
                      {section.modulo?.titulo ?? 'Sem módulo'}
                    </h3>
                    <div className="flex flex-col gap-2">
                      {section.items.map((aula) => (
                        <SortableAulaCard
                          key={aula.id}
                          aula={aula}
                          onEdit={(a) => { setFormError(null); setEditingAula(a) }}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {showCreate && (
        <AulaFormModal
          modulos={modulos}
          initial={emptyForm}
          onSubmit={handleCreate}
          onClose={() => { setShowCreate(false); setFormError(null) }}
          isPending={isPending}
          formError={formError}
          title="Nova aula"
        />
      )}

      {editingAula && (
        <AulaFormModal
          modulos={modulos}
          initial={{
            titulo: editingAula.titulo,
            descricao: editingAula.descricao ?? '',
            pandaInput: editingAula.panda_video_url,
            moduloId: editingAula.modulo_id ?? '',
          }}
          onSubmit={handleUpdate}
          onClose={() => { setEditingAula(null); setFormError(null) }}
          isPending={isPending}
          formError={formError}
          title="Editar aula"
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Write `app/admin/aulas/page.tsx`**

```tsx
// app/admin/aulas/page.tsx
import { getAulas, getModulos } from '@/lib/actions/aulas'
import AulasManager from '@/components/admin/AulasManager'

export default async function AdminAulasPage() {
  const [aulas, modulos] = await Promise.all([getAulas(), getModulos()])
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Aulas</h1>
        <p className="text-muted text-sm mt-1">
          Crie, edite e organize as aulas. Arraste para reordenar.
        </p>
      </div>
      <AulasManager aulas={aulas} modulos={modulos} />
    </div>
  )
}
```

- [ ] **Step 4: Verify aulas admin page**

Visit http://localhost:3000/admin/aulas. Create an aula with a Panda Video URL, assign to a module, verify it appears grouped. Edit it, drag to reorder, delete it.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/aulas.ts components/admin/AulasManager.tsx app/admin/aulas/
git commit -m "feat: admin aulas CRUD with drag-to-reorder"
```

---

### Task 12: README and deploy guide

**Files:**
- Create: `gestores-membros/README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# Trafego / BORDERLESS — Área de Membros

Plataforma de aulas em vídeo para gestores com acesso via magic link.

## Stack

- Next.js 15 (App Router)
- Supabase (Auth + Postgres)
- Tailwind CSS
- TypeScript
- Vercel

## Setup local

1. Clone o repositório
2. Instale dependências: `npm install`
3. Copie as variáveis de ambiente: `cp .env.local.example .env.local`
4. Preencha `.env.local` com as credenciais do Supabase
5. Execute o schema no Supabase SQL Editor: copie e cole `supabase/schema.sql`
6. Rode o dev server: `npm run dev`

## Variáveis de ambiente

| Variável | Onde encontrar |
|----------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Project Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase > Project Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase > Project Settings > API |
| `ADMIN_EMAIL` | Seu próprio email |
| `NEXT_PUBLIC_APP_URL` | URL do Vercel após deploy |

## Deploy no Vercel

1. Crie o repositório no GitHub: `gestores-membros`
2. Push: `git remote add origin https://github.com/SEU_USUARIO/gestores-membros.git && git push -u origin main`
3. Acesse vercel.com > Add New Project > importe `gestores-membros`
4. Configure as variáveis de ambiente (mesmas do `.env.local`, com `NEXT_PUBLIC_APP_URL` = URL do Vercel)
5. Deploy

## Configurar Supabase para produção

Após ter a URL do Vercel:

1. Supabase > Authentication > URL Configuration
2. **Site URL:** `https://seu-projeto.vercel.app`
3. **Redirect URLs:** adicione `https://seu-projeto.vercel.app/auth/callback`

## Rotas

| Rota | Acesso | Descrição |
|------|--------|-----------|
| `/login` | Público | Login via magic link |
| `/aulas` | Gestores + Admin | Lista de aulas |
| `/aulas/[id]` | Gestores + Admin | Player de vídeo |
| `/admin` | Admin | Dashboard |
| `/admin/gestores` | Admin | Gerenciar gestores |
| `/admin/modulos` | Admin | Gerenciar módulos |
| `/admin/aulas` | Admin | Gerenciar aulas |
```

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 3: Final TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Final commit**

```bash
git add README.md
git commit -m "docs: README with setup and deploy guide"
```

- [ ] **Step 5: Create GitHub repository**

```bash
gh repo create gestores-membros --public --source=. --remote=origin --push
```

If `gh` CLI is not installed: go to github.com/new, create repository `gestores-membros`, then:
```bash
git remote add origin https://github.com/digilucas777/gestores-membros.git
git push -u origin main
```

---

## Post-deploy checklist (manual steps)

After deploying to Vercel, do these steps in order:

1. **Supabase Auth redirect URL** — add `https://YOUR_VERCEL_URL/auth/callback` in Supabase > Authentication > URL Configuration
2. **Vercel env vars** — set all 5 env vars (including `NEXT_PUBLIC_APP_URL` = your Vercel URL)
3. **Add first gestor** — go to `/admin/gestores`, add a test email
4. **Test login flow** — open an incognito window, go to `/login`, enter the test email, check inbox, click magic link
5. **Add first aula** — paste a Panda Video URL in `/admin/aulas`
6. **Verify video plays** — click the aula card as a gestor

---

## Self-review notes

- `panda_video_url` column stores the extracted embed URL (not raw iframe code) — `extractPandaVideoUrl` handles both iframe code and direct URLs
- Admin email is gated by `ADMIN_EMAIL` env var in middleware — no DB record needed for admin
- Service role key used server-side only — never exposed to client
- All mutations use Server Actions with `'use server'` directive
- `increment_login_count` is a SQL function to atomically update count + timestamp
