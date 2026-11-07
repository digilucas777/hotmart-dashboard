import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/app/api/meta/_utils'
import { canManageTracking } from '@/app/api/track/_utils'
import { decryptSecret } from '@/lib/crypto'
import { detectWorkersPaid, fetchKvWrites, FREE_WRITES_DAY, PAID_WRITES_MONTH } from '@/lib/track/cfUsage'

// Uso da conta Cloudflare do cliente: visitantes gravados hoje / no mês.
export async function GET(request: Request) {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!(await canManageTracking(supabase, user.id))) return NextResponse.json({ error: 'sem permissão' }, { status: 403 })
  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  const { data: inst } = await supabase.from('track_installations')
    .select('cloudflare_account_id, cloudflare_api_token_encrypted, cloudflare_paid')
    .eq('id', id).eq('user_id', user.id).maybeSingle()
  const row = inst as { cloudflare_account_id: string | null; cloudflare_api_token_encrypted: string | null; cloudflare_paid: boolean } | null
  if (!row) return NextResponse.json({ error: 'instalação não encontrada' }, { status: 404 })
  if (!row.cloudflare_account_id || !row.cloudflare_api_token_encrypted) {
    return NextResponse.json({ available: false, paid: row.cloudflare_paid, detected: null })
  }
  let token = ''
  try { token = decryptSecret(row.cloudflare_api_token_encrypted).trim() } catch { /* sem token */ }
  const [usage, detected] = await Promise.all([fetchKvWrites(token, row.cloudflare_account_id), detectWorkersPaid(token, row.cloudflare_account_id)])
  // Reconheceu o plano sozinho: grava, pra barra e o aviso usarem o limite certo.
  if (detected !== null && detected !== row.cloudflare_paid) {
    await supabase.from('track_installations').update({ cloudflare_paid: detected }).eq('id', id).eq('user_id', user.id)
  }
  const paid = detected ?? row.cloudflare_paid
  if (!usage) return NextResponse.json({ available: false, paid, detected })
  return NextResponse.json({
    available: true, paid, detected, ...usage, limitDay: FREE_WRITES_DAY, limitMonth: PAID_WRITES_MONTH,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

// Cliente marca/desmarca que já está no Workers Paid (quando o plano não dá pra ler sozinho).
export async function PATCH(request: Request) {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = await request.json().catch(() => null) as { id?: string; paid?: boolean } | null
  if (!b?.id || !/^[0-9a-f-]{36}$/i.test(b.id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  const { error } = await supabase.from('track_installations').update({ cloudflare_paid: !!b.paid }).eq('id', b.id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'não foi possível salvar' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
