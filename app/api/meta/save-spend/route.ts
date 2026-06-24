import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '../_utils'

export async function POST(req: NextRequest) {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    projeto_id?: string
    data?: string
    total?: number
    detalhes?: string
  }
  const { projeto_id: projetoId, data, total, detalhes } = body

  if (!projetoId || !data || total == null) {
    return NextResponse.json({ error: 'projeto_id, data e total são obrigatórios' }, { status: 400 })
  }

  const { error: delError } = await supabase
    .from('custos_manuais')
    .delete()
    .eq('projeto_id', projetoId)
    .eq('data', data)
    .eq('origem', 'meta_ads')

  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

  const descricao = detalhes
    ? `Gastos Meta Ads - ${data} - ${detalhes}`
    : `Gastos Meta Ads - ${data}`

  const { error: insError } = await supabase
    .from('custos_manuais')
    .insert({
      projeto_id: projetoId,
      valor: total,
      moeda: 'USD',
      data,
      descricao,
      origem: 'meta_ads',
    })

  if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })

  return NextResponse.json({ sucesso: true, valor: total, data })
}
