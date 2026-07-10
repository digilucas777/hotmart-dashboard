import type { SupabaseClient } from '@supabase/supabase-js'
import { notifySiteIssue, notifySiteRecovered } from '@/lib/push'

const TIMEOUT_MS = 15_000
const SLOW_THRESHOLD_MS = 10_000
const CONCURRENCY = 10

export type Status = 'ok' | 'lento' | 'fora_do_ar' | 'erro_servidor' | 'nao_encontrada'

export type PageRow = {
  id: string
  url: string
  ultimo_status: string | null
  monitored_sites: { user_id: string; nome: string } | null
}

export async function checkPage(url: string): Promise<{ status: Status; statusCode: number | null; tempoMs: number }> {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function checkAndUpdatePages(client: SupabaseClient<any>, pages: PageRow[]) {
  return mapWithConcurrency(pages, CONCURRENCY, async (page) => {
    const resultado = await checkPage(page.url)
    const agora = new Date().toISOString()
    const eraProblema = page.ultimo_status != null && page.ultimo_status !== 'ok'
    const agoraProblema = resultado.status !== 'ok'

    await client
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
}
