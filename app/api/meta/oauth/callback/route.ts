import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getAuthenticatedUser, metaFetch, metaRedirectUri, META_API_VERSION } from '../../_utils'

type TokenResponse = {
  access_token: string
  token_type?: string
  expires_in?: number
}

type MetaUser = {
  id: string
  name?: string
}

type MetaBusinessResponse = {
  data?: { id: string; name: string; verification_status?: string }[]
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const cookieStore = await cookies()
  const storedState = cookieStore.get('dash_speed_meta_state')?.value
  cookieStore.delete('dash_speed_meta_state')

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(`${origin}/integracoes?meta_error=invalid_state`)
  }

  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) {
    return NextResponse.redirect(`${origin}/integracoes?meta_error=missing_credentials`)
  }

  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.redirect(`${origin}/login?next=/integracoes`)

  try {
    const tokenUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`)
    tokenUrl.searchParams.set('client_id', appId)
    tokenUrl.searchParams.set('client_secret', appSecret)
    tokenUrl.searchParams.set('redirect_uri', metaRedirectUri(request))
    tokenUrl.searchParams.set('code', code)

    const tokenResponse = await fetch(tokenUrl, { cache: 'no-store' })
    if (!tokenResponse.ok) throw new Error(await tokenResponse.text())
    const token = await tokenResponse.json() as TokenResponse

    const me = await metaFetch<MetaUser>('/me?fields=id,name', token.access_token)
    const expiresAt = token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : null

    const { data: connection, error: connectionError } = await supabase
      .from('facebook_connections')
      .upsert({
        user_id: user.id,
        facebook_user_id: me.id,
        facebook_user_name: me.name ?? null,
        access_token: token.access_token,
        token_type: token.token_type ?? null,
        expires_at: expiresAt,
        status: 'connected',
      }, { onConflict: 'user_id,facebook_user_id' })
      .select()
      .single()

    if (connectionError || !connection) throw connectionError ?? new Error('connection_error')

    const businesses = await metaFetch<MetaBusinessResponse>('/me/businesses?fields=id,name,verification_status&limit=100', token.access_token)
    if (businesses.data?.length) {
      await supabase.from('business_managers').upsert(
        businesses.data.map(business => ({
          user_id: user.id,
          facebook_connection_id: connection.id,
          bm_id: business.id,
          name: business.name,
          verification_status: business.verification_status ?? null,
        })),
        { onConflict: 'user_id,bm_id' },
      )
    }

    return NextResponse.redirect(`${origin}/integracoes?meta=connected`)
  } catch {
    return NextResponse.redirect(`${origin}/integracoes?meta_error=oauth_failed`)
  }
}
