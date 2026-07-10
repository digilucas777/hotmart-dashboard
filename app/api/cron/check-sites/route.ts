import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifySiteIssue, notifySiteRecovered } from '@/lib/push'

function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const TIMEOUT_MS = 15_000
const SLOW_THRESHOLD_MS = 10_000
const CONCURRENCY = 10

type Status = 'ok' | 'lento' | 'fora_do_ar' | 'erro_servidor' | 'nao_encontrada'

async function checkPage(url: string): Promise<{ status: Status; statusCode: number | null; tempoMs: number }> {
  const inicio = Date.now()
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' })
    const tempoMs = Date.now() - inicio
    if (res.status >= 500) return { status: 'erro_servidor', statusCode: res.status, tempoMs }
    if (res.status >= 400) return { status: 'nao_encontrada', statusCode: res.status, tempoMs }
    if (tempoMs > SLOW_THRESHOLD_MS) return { status: 'lento', statusCode: res.status, tempoMs }
    return { status: 'ok', statusCode: res.status, tempoMs }
  } catch {
    return { status: 'fora_do_ar', statusCode: null, tempoMs: Date.now() - inicio }
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// Roda de hora em hora via GitHub Actions (.github/workflows/check-sites.yml) —
// não depende do Cron da Vercel porque o plano gratuito só roda cron 1x/dia.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 })

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'service key not configured' }, { status: 500 })

  const { data: pages, error } = await admin
    .from('monitored_pages')
    .select('id, url, ultimo_status, monitored_sites(user_id, nome)')
    .eq('ativo', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!pages || pages.length === 0) return NextResponse.json({ ok: true, checadas: 0 })

  type PageRow = { id: string; url: string; ultimo_status: string | null; monitored_sites: { user_id: string; nome: string } | null }

  const resumo = await mapWithConcurrency(pages as unknown as PageRow[], CONCURRENCY, async (page) => {
    const resultado = await checkPage(page.url)
    const agora = new Date().toISOString()
    const eraProblema = page.ultimo_status != null && page.ultimo_status !== 'ok'
    const agoraProblema = resultado.status !== 'ok'

    await admin
      .from('monitored_pages')
      .update({
        ultimo_status: resultado.status,
        ultimo_status_code: resultado.statusCode,
        ultimo_tempo_ms: resultado.tempoMs,
        ultima_checagem_em: agora,
        problema_desde: agoraProblema ? (eraProblema ? undefined : agora) : null,
      })
      .eq('id', page.id)

    const site = page.monitored_sites
    if (site) {
      if (agoraProblema) {
        await notifySiteIssue({
          userId: site.user_id,
          siteName: site.nome,
          url: page.url,
          status: resultado.status as 'fora_do_ar' | 'erro_servidor' | 'nao_encontrada' | 'lento',
          statusCode: resultado.statusCode,
          tempoMs: resultado.tempoMs,
        })
      } else if (eraProblema) {
        await notifySiteRecovered({ userId: site.user_id, siteName: site.nome, url: page.url })
      }
    }

    return { url: page.url, status: resultado.status }
  })

  return NextResponse.json({ ok: true, checadas: resumo.length, resultados: resumo })
}
