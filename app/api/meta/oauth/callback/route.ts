import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createRouteSupabase, metaRedirectUri, META_API_VERSION } from '../../_utils'

type TokenResponse = {
  access_token: string
  token_type?: string
  expires_in?: number
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const cookieStore = await cookies()
  const storedState = cookieStore.get('dash_speed_meta_state')?.value
  cookieStore.delete('dash_speed_meta_state')

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(`${origin}/integracoes?meta=error`)
  }

  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) {
    return NextResponse.redirect(`${origin}/integracoes?meta=error`)
  }

  try {
    const tokenUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`)
    tokenUrl.searchParams.set('client_id', appId)
    tokenUrl.searchParams.set('client_secret', appSecret)
    tokenUrl.searchParams.set('redirect_uri', metaRedirectUri(request))
    tokenUrl.searchParams.set('code', code)

    const tokenResponse = await fetch(tokenUrl, { cache: 'no-store' })
    if (!tokenResponse.ok) throw new Error(await tokenResponse.text())
    const token = await tokenResponse.json() as TokenResponse

    const supabase = await createRouteSupabase()
    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('meta_connections').upsert({
      ...(user ? { user_id: user.id } : {}),
      access_token: token.access_token,
      status: 'connected',
    }, { onConflict: 'user_id' })

    return NextResponse.redirect(`${origin}/integracoes?meta=success`)
  } catch {
    return NextResponse.redirect(`${origin}/integracoes?meta=error`)
  }
}
