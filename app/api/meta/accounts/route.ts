import { NextResponse } from 'next/server'
import { getAuthenticatedUser, metaFetch } from '../_utils'

type BusinessResponse = {
  data?: { id: string; name: string }[]
}

type AdAccountsResponse = {
  data?: {
    id: string
    name: string
    currency?: string
    account_status?: number
  }[]
}

export async function GET() {
  return NextResponse.json({ error: 'Meta API temporariamente desativada' }, { status: 503 })
}
