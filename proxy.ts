import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  // O Next.js carrega em segundo plano ("prefetch") os links do menu assim que
  // a pagina abre — varias requisicoes de prefetch chegam ao mesmo tempo e, se
  // cada uma tentasse renovar a sessao do Supabase, competiriam pelo mesmo
  // refresh token. O Supabase entende isso como possivel roubo de sessao e
  // revoga a sessao inteira, forcando login de novo. Prefetch nunca aparece
  // pra o usuario, entao pular a checagem aqui e seguro — a renovacao de
  // verdade acontece na navegacao real (clique) logo em seguida.
  if (request.headers.get('next-router-prefetch') === '1') {
    return NextResponse.next()
  }

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
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const publicRoutes = ['/', '/login', '/register', '/forgot-password', '/pricing', '/auth/confirm']
  const isPublicRoute = publicRoutes.includes(request.nextUrl.pathname)
  // "/" entra aqui também — usuário já logado que cai na tela inicial (ex: PWA
  // com o atalho antigo, ou entrando direto pelo link) é levado pro dashboard
  // em vez de ver a página de apresentação de novo.
  const isAuthRoute = ['/', '/login', '/register', '/forgot-password'].includes(request.nextUrl.pathname)

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|favicon\\.svg|manifest\\.json|apple-touch-icon\\.png|icon-192\\.png|icon-512\\.png|sw\\.js|api/|auth/callback).*)',
  ],
}
