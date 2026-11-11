import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/app/api/meta/_utils'
import { canManageTracking } from '@/app/api/track/_utils'
import { decryptSecret } from '@/lib/crypto'
import { CF_HISTORICO_DIAS, detectWorkersPaid, fetchKvWrites, findKvNamespaceId, fetchKvWritesDays, FREE_WRITES_DAY, PAID_WRITES_MONTH } from '@/lib/track/cfUsage'

// Uso da conta Cloudflare do cliente: visitantes gravados hoje / no mês e,
// quando vem start/end (o período escolhido no painel), dia a dia no período,
// mais os robôs ignorados (não foram pro Facebook nem gastaram o plano).
export async function GET(request: Request) {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!(await canManageTracking(supabase, user.id))) return NextResponse.json({ error: 'sem permissão' }, { status: 403 })
  const sp = new URL(request.url).searchParams
  const id = sp.get('id') ?? ''
  const startMs = Date.parse(sp.get('start') ?? '')
  const endMs = Date.parse(sp.get('end') ?? '')
  const comPeriodo = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs && endMs - startMs <= 400 * 86400000
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
  // Dias UTC que o período toca (a Cloudflare zera o limite diário à meia-noite UTC).
  // A Cloudflare só guarda 90 dias: um período maior começa no dia mais antigo que ela tem.
  const maisAntigo = new Date(Date.now() - CF_HISTORICO_DIAS * 86400000).toISOString().slice(0, 10)
  // Dias do calendário de quem está olhando (de/ate), senão os dias UTC do período.
  // Sem isso, "outubro" em horário de Brasília virava 32 dias (01/10 a 01/11 em UTC).
  const dia = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
  const de = dia(sp.get('de')), ate = dia(sp.get('ate'))
  const hojeUtc = new Date().toISOString().slice(0, 10)
  const sincePedido = comPeriodo ? (de ?? new Date(startMs).toISOString().slice(0, 10)) : ''
  const since = sincePedido && sincePedido < maisAntigo ? maisAntigo : sincePedido
  const untilBase = ate ?? new Date(Math.min(endMs, Date.now()) - 1).toISOString().slice(0, 10)
  const until = comPeriodo ? (untilBase > hojeUtc ? hojeUtc : untilBase) : ''
  const contar = (filtro: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => filtro(base())
  function base() {
    return supabase.from('track_events').select('*', { count: 'exact', head: true })
      .eq('installation_id', id).eq('is_bot', true)
      .gte('received_at', new Date(startMs).toISOString()).lt('received_at', new Date(endMs).toISOString())
  }
  // O limite e a cobrança são da conta da Cloudflare inteira; os números da
  // instalação saem do KV dela. Sem achar o KV, tudo fica pela conta (como antes).
  const [namespaceId, mesmaConta] = await Promise.all([
    findKvNamespaceId(token, row.cloudflare_account_id, id),
    supabase.from('track_installations').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('cloudflare_account_id', row.cloudflare_account_id),
  ])
  const [usage, detected, dias, ignorados, enviadosAntes] = await Promise.all([
    fetchKvWrites(token, row.cloudflare_account_id, namespaceId),
    detectWorkersPaid(token, row.cloudflare_account_id),
    comPeriodo ? fetchKvWritesDays(token, row.cloudflare_account_id, since, until, namespaceId) : Promise.resolve(null),
    // robô ignorado pelo robô novo (v1.4.0): chega sem capi_send_ok
    comPeriodo ? contar(q => q.is('capi_send_ok', null)) : Promise.resolve(null),
    // robô de antes da correção de 07/11/2026, que foi enviado ao Facebook
    comPeriodo ? contar(q => q.not('capi_send_ok', 'is', null)) : Promise.resolve(null),
  ])
  const periodo = comPeriodo ? {
    dias: dias ?? [],
    cortadoEm: since !== sincePedido ? since : null,
    robosIgnorados: ignorados?.count ?? 0,
    robosAntesDaCorrecao: enviadosAntes?.count ?? 0,
  } : null
  // Reconheceu o plano sozinho: grava, pra barra e o aviso usarem o limite certo.
  if (detected !== null && detected !== row.cloudflare_paid) {
    await supabase.from('track_installations').update({ cloudflare_paid: detected }).eq('id', id).eq('user_id', user.id)
  }
  const paid = detected ?? row.cloudflare_paid
  if (!usage) return NextResponse.json({ available: false, paid, detected, periodo })
  return NextResponse.json({
    available: true, paid, detected, ...usage, porInstalacao: !!namespaceId, instalacoesNaConta: mesmaConta.count ?? 1, limitDay: FREE_WRITES_DAY, limitMonth: PAID_WRITES_MONTH, periodo,
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
