import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createRouteSupabase, metaRedirectUri, META_API_VERSION } from '../../_utils'

type TokenResponse = {
  access_token: string
  token_type?: string
  expires_in?: number
}

type MeResponse = {
  id: string
  name?: string
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  console.log('[META CALLBACK] params:', { code: !!searchParams.get('code'), state: searchParams.get('state'), error: searchParams.get('error') })
  const code = searchParams.get('code')
  const state = searchParams.get('state') ?? ''
  const cookieStore = await cookies()
  cookieStore.delete('dash_speed_meta_state')

  // userId vem no próprio state (csrfToken|userId) — não depende de cookie
  const [, userId] = state.split('|')
  if (!code || !userId) {
    console.log('[META CALLBACK] falha validação:', { hasCode: !!code, hasUserId: !!userId, state })
    return NextResponse.redirect(`${origin}/integracoes?meta=error`)
  }
  console.log('[META CB] state ok, code:', code?.slice(0, 10))

  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) {
    return NextResponse.redirect(`${origin}/integracoes?meta=error`)
  }
  console.log('[META CB] env ok, appId:', appId)

  try {
    const tokenUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`)
    tokenUrl.searchParams.set('client_id', appId)
    tokenUrl.searchParams.set('client_secret', appSecret)
    tokenUrl.searchParams.set('redirect_uri', metaRedirectUri(request))
    tokenUrl.searchParams.set('code', code)

    const tokenResponse = await fetch(tokenUrl, { cache: 'no-store' })
    if (!tokenResponse.ok) throw new Error(await tokenResponse.text())
    const tokenData = await tokenResponse.json() as TokenResponse & { error?: unknown }
    const token = tokenData
    console.log('[META CB] token ok:', !!token.access_token)
    console.log('[META CALLBACK] token response:', { hasToken: !!tokenData.access_token, error: tokenData.error })

    const meRes = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/me?fields=id,name&access_token=${encodeURIComponent(token.access_token)}`,
      { cache: 'no-store' },
    )
    const me: MeResponse = meRes.ok ? await meRes.json() as MeResponse : { id: '' }
    console.log('[META CB] me:', me)

    console.log('[META CB] userId from state:', userId)
    const supabase = await createRouteSupabase()

    console.log('[META CALLBACK] inserindo no banco...', { user_id: userId })
    const { data, error: upsertError } = await supabase.from('meta_connections').upsert({
      user_id: userId,
      access_token: token.access_token,
      meta_user_id: me.id || null,
      meta_user_name: me.name ?? null,
      status: 'connected',
    }, { onConflict: 'user_id' }).select()
    console.log('[META CALLBACK] resultado insert:', { data, error: upsertError })
    console.log('[META CB] upsert error:', upsertError)

    if (upsertError) {
      console.error('Erro ao salvar meta_connections:', upsertError)
      return NextResponse.redirect(`${origin}/integracoes?meta=error&meta_error=${encodeURIComponent(upsertError.message)}`)
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>
      if (window.opener) {
        window.opener.postMessage('meta_oauth_success', '${origin}');
        window.close();
      } else {
        window.location.href = '${origin}/integracoes?meta=success';
      }
    </script></body></html>`
    return new Response(html, { headers: { 'Content-Type': 'text/html' } })
  } catch (err) {
    console.error('[META CB] catch:', err)
    return NextResponse.redirect(`${origin}/integracoes?meta=error`)
  }
}
