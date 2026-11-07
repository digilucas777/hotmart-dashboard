import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/app/api/meta/_utils'
import { canManageTracking } from '@/app/api/track/_utils'

// Custos lançados à mão no painel de rastreamento (tabela track_custos,
// migration 111). A RLS garante que cada um só mexe nas próprias instalações.
const UUID = /^[0-9a-f-]{36}$/i
const DIA = /^\d{4}-\d{2}-\d{2}$/

async function autorizar() {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return { erro: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  if (!(await canManageTracking(supabase, user.id))) {
    return { erro: NextResponse.json({ error: 'você não tem permissão de gerenciar rastreamento' }, { status: 403 }) }
  }
  return { supabase, user }
}

// GET ?installation_id=&de=AAAA-MM-DD&ate=AAAA-MM-DD (inclusivo)
export async function GET(request: Request) {
  const a = await autorizar()
  if ('erro' in a) return a.erro
  const sp = new URL(request.url).searchParams
  const id = sp.get('installation_id') ?? ''
  const de = sp.get('de') ?? ''
  const ate = sp.get('ate') ?? ''
  if (!UUID.test(id) || !DIA.test(de) || !DIA.test(ate)) return NextResponse.json({ error: 'parâmetros inválidos' }, { status: 400 })
  const { data, error } = await a.supabase.from('track_custos')
    .select('id, data, valor, moeda, descricao').eq('installation_id', id).gte('data', de).lte('data', ate)
    .order('data', { ascending: false }).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ custos: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const a = await autorizar()
  if ('erro' in a) return a.erro
  const b = await request.json().catch(() => null) as { installation_id?: string; data?: string; valor?: number; moeda?: string; descricao?: string } | null
  const valor = Number(b?.valor)
  if (!b || !UUID.test(b.installation_id ?? '') || !DIA.test(b.data ?? '') || !Number.isFinite(valor) || valor < 0 || valor > 100_000_000 || !['BRL', 'USD'].includes(b.moeda ?? '')) {
    return NextResponse.json({ error: 'dados inválidos' }, { status: 400 })
  }
  const { data, error } = await a.supabase.from('track_custos').insert({
    installation_id: b.installation_id, data: b.data, valor: Math.round(valor * 100) / 100, moeda: b.moeda,
    descricao: (b.descricao ?? '').trim().slice(0, 200) || null,
  }).select('id').single()
  if (error) return NextResponse.json({ error: 'não foi possível salvar o custo' }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

// DELETE ?id=
export async function DELETE(request: Request) {
  const a = await autorizar()
  if ('erro' in a) return a.erro
  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (!UUID.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  const { error, count } = await a.supabase.from('track_custos').delete({ count: 'exact' }).eq('id', id)
  if (error) return NextResponse.json({ error: 'não foi possível apagar' }, { status: 500 })
  if (!count) return NextResponse.json({ error: 'custo não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
