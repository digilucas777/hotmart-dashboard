import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifySupabaseDown, notifySupabaseRecovered } from '@/lib/push'

function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Caso real (2026-08-20): o gateway da própria Supabase ficou degradado —
// toda consulta ficava pendurada sem nunca responder, e a Dash Speed inteira
// parecia "só fica atualizando", sem nenhum aviso. Não tem workaround pra
// isso do nosso lado (é infraestrutura de terceiro), mas dá pra detectar e
// avisar rápido em vez de só descobrir quando um usuário reclama.
//
// Pedido do usuário (2026-09-29): soluço isolado (1 falha, resolvida na
// checagem seguinte) não merece aviso nenhum — só incomoda. O workflow do
// GitHub Actions conta quantas checagens seguidas já falharam ANTES desta
// (falhas_seguidas) e só a partir do limiar abaixo é que os pushes disparam.
// O e-mail automático do GitHub (toda vez que o curl falha, sem limiar
// nenhum) continua sendo a rede de segurança que nunca depende de a Supabase
// estar de pé pra funcionar.
//
// Limiar ajustado em 2026-10-02 (pedido do usuário): uma queda de 5-10min
// (limiar antigo, 2 falhas) normalmente nem chega a afetar vendas de verdade
// (o webhook da Hotmart grava com service role, que não passa pela RLS que
// costuma ser o gargalo, e confirmadamente continuou gravando em <2min de
// atraso mesmo durante os incidentes de 27-28/09 e 02/10). Só vale interromper
// alguém quando já durou o suficiente pra arriscar perder uma venda de
// verdade — por isso o limiar subiu pra 6 checagens seguidas (cron a cada
// 5min = ~25-30min de queda contínua). Se mudar o intervalo do cron em
// check-supabase-health.yml, reconsiderar este número junto.
const FALHAS_PARA_ALERTAR = 6

// Aviso de QUEDA: melhor esforço — tentamos mandar push mesmo assim porque
// nem toda falha na tabela "vendas" significa a Supabase inteira fora do ar
// (pode ser só uma trava pontual naquela consulta); se ler push_subscriptions
// também falhar (Supabase realmente fora do ar), notifySupabaseDown() já
// engole o erro sozinho e não derruba esta rota — o e-mail do GitHub cobre
// esse caso de qualquer forma.
// Aviso de RECUPERAÇÃO: mesma lógica — só dispara se a queda anterior já
// tinha atingido o limiar de FALHAS_PARA_ALERTAR, pra não mandar "sistema
// normalizado" depois de um soluço que ninguém percebeu.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 })

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'service key not configured' }, { status: 500 })

  const falhasSeguidas = Number(new URL(request.url).searchParams.get('falhas_seguidas')) || 0

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)
  try {
    const { error } = await admin
      .from('vendas')
      .select('id', { head: true, count: 'exact' })
      .limit(1)
      .abortSignal(controller.signal)
    if (error) throw new Error(error.message)
  } catch (err) {
    // Só avisa quando ESTA falha completa o limiar — uma queda curta não
    // dispara nada, só a próxima checagem decide se já durou o suficiente.
    if (falhasSeguidas + 1 >= FALHAS_PARA_ALERTAR) {
      await notifySupabaseDown()
    }
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    )
  } finally {
    clearTimeout(timeoutId)
  }

  const recuperado = falhasSeguidas >= FALHAS_PARA_ALERTAR
  if (recuperado) {
    await notifySupabaseRecovered()
  }

  return NextResponse.json({ ok: true, recuperado })
}
