// Republica SÓ o código do robô (track-worker/src) nas instalações publicadas,
// mantendo todas as configurações atuais (pixels, tokens, KV, domínios):
// metadata.keep_bindings preserva o que já está lá.
// Uso: node --env-file=.env.local scripts/_redeploy-worker-code.mjs [--publicar]
// Sem --publicar só mostra a versão no ar de cada instalação.
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const PUBLICAR = process.argv.includes('--publicar')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const CF = 'https://api.cloudflare.com/client/v4'
const MODULOS = ['index.js', 'hash.js', 'snippet.js', 'phone.js', 'bots.js']

function decryptSecret(payload) {
  const [ivB64, tagB64, dataB64] = payload.split('.')
  const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(process.env.TRACK_ENCRYPTION_KEY, 'base64'), Buffer.from(ivB64, 'base64'))
  d.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([d.update(Buffer.from(dataB64, 'base64')), d.final()]).toString('utf8')
}
const scriptNameFor = id => `track-${id.replace(/-/g, '').slice(0, 16)}`
async function health(sub) {
  try { const r = await fetch(`https://${sub}/health`); return (await r.json()).version } catch (e) { return `erro: ${e.message}` }
}

const { data: insts, error } = await sb.from('track_installations')
  .select('id, nome, worker_subdomain, cloudflare_account_id, cloudflare_api_token_encrypted, status').eq('status', 'deployed').order('nome')
if (error) throw error

for (const i of insts) {
  const antes = await health(i.worker_subdomain)
  console.log(`${i.nome} | ${i.worker_subdomain} | no ar: ${antes}`)
  if (!PUBLICAR) continue
  const token = decryptSecret(i.cloudflare_api_token_encrypted)
  const dir = path.join(process.cwd(), 'track-worker', 'src')
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify({
    main_module: 'index.js',
    compatibility_date: '2026-01-01',
    keep_bindings: ['plain_text', 'secret_text', 'kv_namespace', 'json'],
  })], { type: 'application/json' }))
  for (const m of MODULOS) form.append(m, new Blob([fs.readFileSync(path.join(dir, m), 'utf8')], { type: 'application/javascript+module' }), m)
  const r = await fetch(`${CF}/accounts/${i.cloudflare_account_id}/workers/scripts/${scriptNameFor(i.id)}`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: form,
  })
  const j = await r.json()
  if (!j.success) { console.log('   ERRO ao publicar:', JSON.stringify(j.errors)); continue }
  await new Promise(res => setTimeout(res, 4000))
  const depois = await health(i.worker_subdomain)
  const tjs = await fetch(`https://${i.worker_subdomain}/t.js`).then(x => x.text()).catch(() => '')
  console.log(`   publicado. versão agora: ${depois} | filtro de robô no script da página: ${tjs.includes('navigator.webdriver') ? 'sim' : 'NÃO'}`)
}
