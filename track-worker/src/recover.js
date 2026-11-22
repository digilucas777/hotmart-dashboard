// Recuperação de visita perdida (22/11/2026).
//
// Achado real: pressel com botão em base64 (window.location.href fixo, sem
// parâmetros) no navegador interno do Facebook/Instagram no iPhone. Ao trocar
// de página, os cookies chegavam apagados: a 2ª página virava uma visita nova,
// sem UTM e sem fbc, e a venda ia pra Meta sem o clique do anúncio.
//
// Solução: toda visita que chega COM origem de anúncio (fbc ou UTM) fica
// guardada no KV pela "impressão do aparelho" (IP + navegador completo) por 30
// min. Uma visita nova que chega SEM nada, do mesmo aparelho, herda a origem
// dela. Só herda se houver UMA única visita com origem nesses 30 min: se duas
// visitas diferentes do mesmo aparelho/internet chegaram com origem (ex: 4G da
// operadora, que coloca muita gente atrás do mesmo IP), não mexe.
import { sha256Hex } from './hash.js'

export const JANELA_RECUPERACAO_MS = 30 * 60 * 1000

function temOrigem(d) {
  if (!d) return false
  if (d.fbc) return true
  const u = d.utm
  return !!(u && typeof u === 'object' && Object.values(u).some(Boolean))
}

async function chaveAparelho(ip, userAgent) {
  if (!ip || !userAgent) return null
  return `dev:${await sha256Hex(`${ip}|${userAgent}`)}`
}

// Visita com origem: registra no aparelho. Guarda também a anterior, pra
// saber se teve outra visita com origem no mesmo aparelho na janela.
export async function registrarOrigemDoAparelho(kv, { ip, userAgent, sessionId, data, agora = Date.now() }) {
  if (!kv || !temOrigem(data)) return
  const key = await chaveAparelho(ip, userAgent)
  if (!key) return
  let atual = null
  try { const raw = await kv.get(key); if (raw) atual = JSON.parse(raw) } catch { atual = null }
  if (atual && atual.sid === sessionId) return
  const anterior = atual ? { sid: atual.sid, t: atual.t } : null
  const valor = {
    sid: sessionId,
    t: agora,
    prev: anterior,
    data: { fbc: data.fbc || null, fbp: data.fbp || null, utm: data.utm || null, src: data.src || null, url: data.url || null },
  }
  await kv.put(key, JSON.stringify(valor), { expirationTtl: Math.ceil(JANELA_RECUPERACAO_MS / 1000) + 60 })
}

// Visita sem origem: procura a do mesmo aparelho. Devolve { sid, data } ou null.
export async function buscarOrigemDoAparelho(kv, { ip, userAgent, sessionId, agora = Date.now() }) {
  if (!kv) return null
  const key = await chaveAparelho(ip, userAgent)
  if (!key) return null
  let e = null
  try { const raw = await kv.get(key); if (raw) e = JSON.parse(raw) } catch { return null }
  if (!e || !e.data || e.sid === sessionId) return null
  if (agora - e.t > JANELA_RECUPERACAO_MS || e.t > agora + 60000) return null
  // outra visita com origem do mesmo aparelho/internet na janela: ambíguo, não mexe
  if (e.prev && e.prev.sid !== e.sid && agora - e.prev.t <= JANELA_RECUPERACAO_MS) return null
  if (!temOrigem(e.data)) return null
  return { sid: e.sid, data: e.data }
}

export { temOrigem }
