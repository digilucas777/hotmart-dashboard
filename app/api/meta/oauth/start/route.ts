import { randomUUID } from 'crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getAuthenticatedUser, metaRedirectUri, META_API_VERSION } from '../../_utils'

export async function GET(request: Request) {
  const { origin } = new URL(request.url)
  const { user } = await getAuthenticatedUser()

  if (!user) return NextResponse.redirect(`${origin}/login?next=/integracoes`)

  const appId = process.env.META_APP_ID
  if (!appId) return NextResponse.redirect(`${origin}/integracoes?meta_error=missing_app_id`)

  const csrfToken = randomUUID()
  const state = `${csrfToken}|${user.id}`
  console.log('[META START] userId:', user.id, 'state:', state)
  const cookieStore = await cookies()
  cookieStore.set('dash_speed_meta_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: origin.startsWith('https://'),
    path: '/',
    maxAge: 600,
  })

  const url = new URL('https://www.facebook.com/dialog/oauth')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', metaRedirectUri(request))
  url.searchParams.set('state', csrfToken)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'ads_read,ads_management,business_management')
  url.searchParams.set('auth_type', 'rerequest')
  url.searchParams.set('display', 'popup')
  const configId = process.env.META_CONFIG_ID
  // if (configId) url.searchParams.set('config_id', configId)

  return NextResponse.redirect(url)
}
