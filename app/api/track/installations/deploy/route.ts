import { readFileSync } from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/app/api/meta/_utils'
import { decryptSecret } from '@/lib/crypto'
import {
  deployWorkerScript, ensureCustomDomain, ensureKvNamespace, getAccountId, getZoneId, verifyToken,
  type WorkerBinding,
} from '@/lib/track/cloudflareApi'

function scriptNameFor(installationId: string): string {
  return `track-${installationId.replace(/-/g, '').slice(0, 16)}`
}

function readWorkerModules() {
  const dir = path.join(process.cwd(), 'track-worker', 'src')
  return [
    { filename: 'index.js', content: readFileSync(path.join(dir, 'index.js'), 'utf8') },
    { filename: 'hash.js', content: readFileSync(path.join(dir, 'hash.js'), 'utf8') },
    { filename: 'snippet.js', content: readFileSync(path.join(dir, 'snippet.js'), 'utf8') },
  ]
}

type PixelRow = { pixel_id: string; capi_token_encrypted: string | null; test_event_code: string | null }
type DomainRow = { domain: string; tipo: string }

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await request.json().catch(() => ({})) as { id?: string }
  if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })

  const { data: installation, error: fetchError } = await supabase
    .from('track_installations')
    .select('*, track_pixels(*), track_domains(*), track_triggers(*)')
    .eq('id', id)
    .single()
  if (fetchError || !installation) return NextResponse.json({ error: 'instalação não encontrada' }, { status: 404 })

  if (!installation.cloudflare_api_token_encrypted) {
    return NextResponse.json({ error: 'cole o token da Cloudflare na seção 1 antes de fazer deploy' }, { status: 400 })
  }
  if (!installation.worker_subdomain) {
    return NextResponse.json({ error: 'defina o subdomínio do Worker na seção 2 antes de fazer deploy' }, { status: 400 })
  }
  const pixels = (installation.track_pixels ?? []) as PixelRow[]
  if (pixels.length === 0) {
    return NextResponse.json({ error: 'adicione ao menos um pixel antes de fazer deploy' }, { status: 400 })
  }

  const token = decryptSecret(installation.cloudflare_api_token_encrypted)

  try {
    const verification = await verifyToken(token)
    if (!verification.ok) {
      return NextResponse.json({ error: verification.error ?? 'token da Cloudflare inválido ou revogado' }, { status: 400 })
    }

    const accountId = await getAccountId(token)

    const rootDomain = installation.worker_subdomain.split('.').slice(-2).join('.')
    const zoneId = await getZoneId(token, rootDomain)
    if (!zoneId) {
      return NextResponse.json(
        { error: `domínio ${rootDomain} não encontrado nessa conta Cloudflare — confirme se ele já foi adicionado lá` },
        { status: 400 },
      )
    }

    const scriptName = scriptNameFor(installation.id)
    const kvNamespaceId = await ensureKvNamespace(token, accountId, `track_sessions_${installation.id}`)

    const lpDomains = (installation.track_domains ?? [])
      .filter((d: DomainRow) => d.tipo === 'lp')
      .map((d: DomainRow) => d.domain)

    const bindings: WorkerBinding[] = [
      { type: 'kv_namespace', name: 'SESSIONS', namespace_id: kvNamespaceId },
      {
        type: 'secret_text',
        name: 'PIXELS_JSON',
        text: JSON.stringify(pixels.map(p => ({
          pixel_id: p.pixel_id,
          capi_token: p.capi_token_encrypted ? decryptSecret(p.capi_token_encrypted) : '',
          test_event_code: p.test_event_code,
        }))),
      },
      { type: 'secret_text', name: 'WEBHOOK_SECRET', text: installation.webhook_secret },
      { type: 'plain_text', name: 'DOMAINS_JSON', text: JSON.stringify(lpDomains) },
      { type: 'plain_text', name: 'TRIGGERS_JSON', text: JSON.stringify(installation.track_triggers ?? []) },
      { type: 'plain_text', name: 'SESSION_ENRICHMENT_ENABLED', text: String(installation.session_enrichment_enabled) },
      { type: 'plain_text', name: 'SESSION_TTL_DAYS', text: String(installation.session_ttl_days) },
      { type: 'plain_text', name: 'DIAGNOSTICO_ATIVO', text: String(installation.diagnostico_ativo) },
    ]

    await deployWorkerScript(token, accountId, scriptName, readWorkerModules(), bindings)
    await ensureCustomDomain(token, accountId, zoneId, installation.worker_subdomain, scriptName)

    await supabase.from('track_installations').update({
      status: 'deployed',
      cloudflare_account_id: accountId,
      updated_at: new Date().toISOString(),
    }).eq('id', id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'erro desconhecido no deploy'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
