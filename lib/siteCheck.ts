import type { SupabaseClient } from '@supabase/supabase-js'
import { notifySiteIssue, notifySiteRecovered, notifyCloakerIssue, notifyCloakerRecovered } from '@/lib/push'

const TIMEOUT_MS = 15_000
const SLOW_THRESHOLD_MS = 10_000
const CONCURRENCY = 10

// Identificável de propósito — mais fácil pro dono liberar isso numa allowlist do
// cloacker do que tentar imitar um celular de verdade (que pode mudar e quebrar).
const MONITOR_USER_AGENT = 'Mozilla/5.0 (Linux; Android 13; Mobile) DashSpeedMonitor/1.0 (+monitoramento de cloaker)'

// Marca escondida esperada no HTML da página "black" (ver migrations/051).
// Busca simples de substring, sem exigir sintaxe exata de comentário — mais
// tolerante a variações de espaço/aspas que o dono possa usar ao colar o bloco.
const CLOAKER_MARKER = 'pagina:black'

export type Status = 'ok' | 'lento' | 'fora_do_ar' | 'erro_servidor' | 'nao_encontrada'
export type CloakerStatus = 'ok' | 'falhou'

export type PageRow = {
  id: string
  url: string
  ultimo_status: string | null
  verificar_cloaker: boolean
  ultimo_status_cloaker: string | null
  monitored_sites: { user_id: string; nome: string } | null
}

export async function checkCloaker(url: string): Promise<CloakerStatus> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
      headers: { 'User-Agent': MONITOR_USER_AGENT },
    })
    if (!res.ok) return 'falhou'
    const html = await res.text()
    return html.toLowerCase().includes(CLOAKER_MARKER) ? 'ok' : 'falhou'
  } catch {
    return 'falhou'
  }
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
    const [resultado, cloakerStatus] = await Promise.all([
      checkPage(page.url),
      page.verificar_cloaker ? checkCloaker(page.url) : Promise.resolve(null),
    ])
    const agora = new Date().toISOString()
    const eraProblema = page.ultimo_status != null && page.ultimo_status !== 'ok'
    const agoraProblema = resultado.status !== 'ok'
    const eraProblemaCloaker = page.verificar_cloaker && page.ultimo_status_cloaker === 'falhou'
    const agoraProblemaCloaker = cloakerStatus === 'falhou'

    await client
      .from('monitored_pages')
      .update({
        ultimo_status: resultado.status,
        ultimo_status_code: resultado.statusCode,
        ultimo_tempo_ms: resultado.tempoMs,
        ultima_checagem_em: agora,
        problema_desde: agoraProblema ? (eraProblema ? undefined : agora) : null,
        ...(page.verificar_cloaker ? {
          ultimo_status_cloaker: cloakerStatus,
          cloaker_problema_desde: agoraProblemaCloaker ? (eraProblemaCloaker ? undefined : agora) : null,
        } : {}),
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

      if (page.verificar_cloaker) {
        // Mesmo padrão do status HTTP: notifica a cada checagem enquanto o problema
        // persistir (não só na transição) — um cloacker fora do ar pode estar
        // queimando verba de anúncio a cada hora que passa despercebido.
        if (agoraProblemaCloaker) {
          await notifyCloakerIssue({ userId: site.user_id, siteName: site.nome, url: page.url })
        } else if (eraProblemaCloaker) {
          await notifyCloakerRecovered({ userId: site.user_id, siteName: site.nome, url: page.url })
        }
      }
    }

    return { url: page.url, status: resultado.status, statusCloaker: cloakerStatus }
  })
}
