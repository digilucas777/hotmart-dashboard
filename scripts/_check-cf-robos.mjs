// Confere se os acessos de robô contam no limite da Cloudflare: compara, dia a
// dia (UTC), as gravações no KV e as chamadas ao Worker que a Cloudflare
// registrou com as sessões novas no nosso banco (com e sem robôs).
// Uso: node --env-file=.env.local scripts/_check-cf-robos.mjs
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function decryptSecret(payload) {
  const [ivB64, tagB64, dataB64] = payload.split('.')
  const key = Buffer.from(process.env.TRACK_ENCRYPTION_KEY, 'base64')
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  d.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([d.update(Buffer.from(dataB64, 'base64')), d.final()]).toString('utf8')
}

const { data: insts, error } = await sb.from('track_installations')
  .select('id, nome, cloudflare_account_id, cloudflare_api_token_encrypted, status').eq('status', 'deployed')
if (error) throw error

const contas = new Map()
for (const i of insts) {
  if (!i.cloudflare_account_id || !i.cloudflare_api_token_encrypted) continue
  const c = contas.get(i.cloudflare_account_id) ?? { token: decryptSecret(i.cloudflare_api_token_encrypted), insts: [] }
  c.insts.push(i)
  contas.set(i.cloudflare_account_id, c)
}

const hoje = new Date().toISOString().slice(0, 10)
const desde = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)

for (const [accountId, c] of contas) {
  console.log(`\n=== Conta ${accountId.slice(0, 6)}... instalações: ${c.insts.map(i => i.nome).join(', ')}`)
  const query = `query($a:String!,$s:Date!,$u:Date!){viewer{accounts(filter:{accountTag:$a}){
    kv: kvOperationsAdaptiveGroups(limit:200, filter:{date_geq:$s,date_leq:$u}){dimensions{date actionType} sum{requests}}
    w: workersInvocationsAdaptive(limit:500, filter:{date_geq:$s,date_leq:$u}){dimensions{date scriptName} sum{requests}}
  }}}`
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST', headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { a: accountId, s: desde, u: hoje } }),
  })
  const j = await r.json()
  if (j.errors) { console.log('erro graphql:', JSON.stringify(j.errors).slice(0, 300)); continue }
  const acc = j.data.viewer.accounts[0]
  const kv = new Map(), wk = new Map()
  for (const g of acc.kv) if (g.dimensions.actionType.toLowerCase() === 'write') kv.set(g.dimensions.date, (kv.get(g.dimensions.date) ?? 0) + g.sum.requests)
  for (const g of acc.w) wk.set(g.dimensions.date, (wk.get(g.dimensions.date) ?? 0) + g.sum.requests)

  // sessões novas por dia UTC (1ª aparição de cada session_id), com e sem robô
  const ids = c.insts.map(i => i.id)
  const linhas = []
  for (let off = 0; ; off += 1000) {
    const { data, error: e } = await sb.from('track_events')
      .select('session_id, received_at, is_bot, source, event_name')
      .in('installation_id', ids).eq('source', 'capi').neq('event_name', 'Purchase')
      .gte('received_at', `${desde}T00:00:00Z`).order('received_at').range(off, off + 999)
    if (e) throw e
    linhas.push(...data)
    if (data.length < 1000) break
  }
  const visto = new Set()
  const sess = new Map()
  for (const l of linhas) {
    if (!l.session_id || visto.has(l.session_id)) continue
    visto.add(l.session_id)
    const d = l.received_at.slice(0, 10)
    const x = sess.get(d) ?? { total: 0, robo: 0 }
    x.total++; if (l.is_bot) x.robo++
    sess.set(d, x)
  }
  console.log('dia (UTC)   | gravações KV (Cloudflare) | sessões novas no banco: todas / só robôs / sem robôs | chamadas ao Worker')
  for (let t = new Date(`${desde}T00:00:00Z`); t.toISOString().slice(0, 10) <= hoje; t = new Date(t.getTime() + 86400000)) {
    const d = t.toISOString().slice(0, 10)
    const s = sess.get(d) ?? { total: 0, robo: 0 }
    console.log(`${d}  | ${String(kv.get(d) ?? 0).padStart(6)} | ${String(s.total).padStart(6)} / ${String(s.robo).padStart(5)} / ${String(s.total - s.robo).padStart(6)} | ${wk.get(d) ?? 0}`)
  }
}
