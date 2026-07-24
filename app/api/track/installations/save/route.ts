import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { getAuthenticatedUser } from '@/app/api/meta/_utils'
import { encryptSecret } from '@/lib/crypto'
import { mapInstallationRow, type InstallationRow } from '@/lib/track/mapRow'
import type {
  TrackDomainInput,
  TrackInstallationSaveInput,
  TrackPixelInput,
  TrackTriggerInput,
} from '@/lib/track/types'

const SELECT = '*, track_pixels(*), track_domains(*), track_triggers(*)'
const VALID_DOMAIN_TIPOS = ['lp', 'checkout']
const VALID_TRIGGER_TIPOS = [
  'scroll', 'form_submit', 'click_link', 'click_element', 'url_visited', 'time_on_page', 'video_progress',
]

type SupabaseClient = Awaited<ReturnType<typeof getAuthenticatedUser>>['supabase']

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'módulo em teste — só administradores podem usar por enquanto' }, { status: 403 })
  }

  const body = await request.json().catch(() => null) as TrackInstallationSaveInput | null
  if (!body || !body.nome?.trim()) {
    return NextResponse.json({ error: 'nome é obrigatório' }, { status: 400 })
  }
  for (const d of body.domains ?? []) {
    if (!VALID_DOMAIN_TIPOS.includes(d.tipo)) {
      return NextResponse.json({ error: `tipo de domínio inválido: ${d.tipo}` }, { status: 400 })
    }
  }
  for (const t of body.triggers ?? []) {
    if (!VALID_TRIGGER_TIPOS.includes(t.tipo)) {
      return NextResponse.json({ error: `tipo de gatilho inválido: ${t.tipo}` }, { status: 400 })
    }
  }

  const installationFields: Record<string, unknown> = {
    nome: body.nome.trim(),
    worker_subdomain: body.worker_subdomain?.trim() || null,
    webhook_meta_event: body.webhook_meta_event?.trim() || 'Purchase',
    session_enrichment_enabled: !!body.session_enrichment_enabled,
    session_ttl_days: body.session_ttl_days ?? 7,
    diagnostico_ativo: !!body.diagnostico_ativo,
    updated_at: new Date().toISOString(),
  }
  if (body.cloudflare_api_token) {
    installationFields.cloudflare_api_token_encrypted = encryptSecret(body.cloudflare_api_token)
  }

  let installationId = body.id

  if (installationId) {
    const { data: existing } = await supabase
      .from('track_installations')
      .select('id')
      .eq('id', installationId)
      .maybeSingle()
    if (!existing) return NextResponse.json({ error: 'instalação não encontrada' }, { status: 404 })

    const { error } = await supabase.from('track_installations').update(installationFields).eq('id', installationId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { data: inserted, error } = await supabase
      .from('track_installations')
      .insert({ ...installationFields, user_id: user.id, webhook_secret: crypto.randomBytes(24).toString('hex') })
      .select('id')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    installationId = inserted.id as string
  }

  await syncChildren<TrackPixelInput>(supabase, 'track_pixels', installationId, body.pixels ?? [], pixel => {
    const row: Record<string, unknown> = {
      installation_id: installationId,
      pixel_id: pixel.pixel_id.trim(),
      test_event_code: pixel.test_event_code?.trim() || null,
    }
    if (pixel.capi_token) row.capi_token_encrypted = encryptSecret(pixel.capi_token)
    return row
  })

  await syncChildren<TrackDomainInput>(supabase, 'track_domains', installationId, body.domains ?? [], domain => ({
    installation_id: installationId,
    domain: domain.domain.trim(),
    tipo: domain.tipo,
  }))

  await syncChildren<TrackTriggerInput>(supabase, 'track_triggers', installationId, body.triggers ?? [], trigger => ({
    installation_id: installationId,
    tipo: trigger.tipo,
    meta_event: trigger.meta_event,
    config: trigger.config ?? {},
    ativo: trigger.ativo ?? true,
  }))

  const { data: full, error: fetchError } = await supabase
    .from('track_installations')
    .select(SELECT)
    .eq('id', installationId)
    .single()
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })

  return NextResponse.json({ installation: mapInstallationRow(full as unknown as InstallationRow) })
}

// Sincroniza uma lista filha (pixels/domains/triggers) com o payload recebido:
// item com id existente -> update, item sem id -> insert, id que sumiu da lista -> delete.
// Evita apagar-tudo-e-recriar pra não perder o valor criptografado dos tokens
// quando o front-end reenvia um item sem ter mudado o token dele.
async function syncChildren<T extends { id?: string }>(
  supabase: SupabaseClient,
  table: string,
  installationId: string,
  items: T[],
  buildRow: (item: T) => Record<string, unknown>,
) {
  const { data: existingRows } = await supabase.from(table).select('id').eq('installation_id', installationId)
  const existingIds = new Set(((existingRows ?? []) as { id: string }[]).map(r => r.id))
  const incomingIds = new Set(items.filter(i => i.id).map(i => i.id as string))

  const idsToDelete = [...existingIds].filter(id => !incomingIds.has(id))
  if (idsToDelete.length > 0) {
    await supabase.from(table).delete().in('id', idsToDelete)
  }

  for (const item of items) {
    const row = buildRow(item)
    if (item.id && existingIds.has(item.id)) {
      await supabase.from(table).update(row).eq('id', item.id)
    } else {
      await supabase.from(table).insert(row)
    }
  }
}
