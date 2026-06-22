import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { metaRedirectUri, META_API_VERSION } from '../../_utils'

type TokenResponse = {
  access_token: string
  token_type?: string
  expires_in?: number
  error?: unknown
}

type MeResponse = {
  id: string
  name?: string
}

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  console.log('[META CALLBACK] params:', { code: !!searchParams.get('code'), state: searchParams.get('state'), error: searchParams.get('error') })
  const code = searchParams.get('code')
  const state = searchParams.get('state') ?? ''
  const cookieStore = await cookies()
  cookieStore.delete('dash_speed_meta_state')

  // userId vem no próprio state (csrfToken|userId) — não depende de cookie
  const parts = state.split('|')
  const userId = parts[parts.length - 1]
  if (!code || !userId || userId.length < 10) {
    console.log('[META CALLBACK] falha validação:', { hasCode: !!code, userId, state })
    return popupResponse(origin, false)
  }
  console.log('[META CB] state ok, userId:', userId.slice(0, 8))

  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) {
    console.error('[META CALLBACK] env vars ausentes')
    return popupResponse(origin, false)
  }

  try {
    const tokenUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`)
    tokenUrl.searchParams.set('client_id', appId)
    tokenUrl.searchParams.set('client_secret', appSecret)
    tokenUrl.searchParams.set('redirect_uri', metaRedirectUri(request))
    tokenUrl.searchParams.set('code', code)

    const tokenResponse = await fetch(tokenUrl, { cache: 'no-store' })
    if (!tokenResponse.ok) throw new Error(await tokenResponse.text())
    const tokenData = await tokenResponse.json() as TokenResponse
    console.log('[META CALLBACK] token response:', { hasToken: !!tokenData.access_token, error: tokenData.error })
    if (!tokenData.access_token) throw new Error('Token vazio: ' + JSON.stringify(tokenData))

    const meRes = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/me?fields=id,name&access_token=${encodeURIComponent(tokenData.access_token)}`,
      { cache: 'no-store' },
    )
    const me: MeResponse = meRes.ok ? await meRes.json() as MeResponse : { id: '' }
    console.log('[META CB] me:', me)

    // Usa service role para bypassar RLS — userId já foi validado via OAuth state
    const supabase = serviceSupabase()
    console.log('[META CALLBACK] inserindo no banco...', { user_id: userId })
    const { data, error: insertError } = await supabase.from('meta_connections').insert({
      user_id: userId,
      access_token: tokenData.access_token,
      meta_user_id: me.id || null,
      meta_user_name: me.name ?? null,
      status: 'connected',
      is_active: true,
    }).select()
    console.log('[META CALLBACK] resultado insert:', { data, error: insertError })

    if (insertError) {
      console.error('[META CALLBACK] erro insert:', insertError)
      return popupResponse(origin, false)
    }

    return popupResponse(origin, true)
  } catch (err) {
    console.error('[META CB] catch:', err)
    return popupResponse(origin, false)
  }
}

function popupResponse(origin: string, success: boolean) {
  const dest = success ? `${origin}/integracoes?meta=success` : `${origin}/integracoes?meta=error`
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<script>
  try {
    if (window.opener) {
      window.opener.postMessage('${success ? 'meta_oauth_success' : 'meta_oauth_error'}', '${origin}');
    }
    window.close();
  } catch(e) {}
  // fallback se window.close() não funcionar
  setTimeout(function() {
    window.location.href = '${dest}';
  }, 500);
</script>
<p style="font-family:sans-serif;text-align:center;margin-top:40px;color:#aaa">
  ${success ? 'Conectado! Fechando...' : 'Erro na conexão. Redirecionando...'}
</p>
</body></html>`
  return new Response(html, { headers: { 'Content-Type': 'text/html' } })
}
