import { randomUUID } from 'crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getAuthenticatedUser, metaRedirectUri, META_API_VERSION } from '../../_utils'

export async function GET(request: Request) {
  const { user } = await getAuthenticatedUser()
  const { origin } = new URL(request.url)

  if (!user) return NextResponse.redirect(`${origin}/login?next=/integracoes`)

  const appId = process.env.META_APP_ID
  if (!appId) return NextResponse.redirect(`${origin}/integracoes?meta_error=missing_app_id`)

  const state = randomUUID()
  const cookieStore = await cookies()
  cookieStore.set('dash_speed_meta_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: origin.startsWith('https://'),
    path: '/',
    maxAge: 600,
  })

  const url = new URL(`https://www.facebook.com/${META_API_VERSION}/dialog/oauth`)
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', metaRedirectUri(request))
  url.searchParams.set('state', state)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'email,public_profile,ads_read,business_management,read_insights')

  return NextResponse.redirect(url)
}
