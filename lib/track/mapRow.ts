import { maskEncrypted } from '@/lib/crypto'
import type { TrackDomain, TrackInstallation, TrackPixel, TrackTrigger } from '@/lib/track/types'

type PixelRow = {
  id: string
  pixel_id: string
  capi_token_encrypted: string | null
  test_event_code: string | null
}

type DomainRow = {
  id: string
  domain: string
  tipo: TrackDomain['tipo']
}

type TriggerRow = {
  id: string
  tipo: TrackTrigger['tipo']
  meta_event: string
  config: Record<string, unknown>
}

export type InstallationRow = {
  id: string
  nome: string
  worker_subdomain: string | null
  cloudflare_api_token_encrypted: string | null
  webhook_platform: string
  webhook_meta_event: string
  webhook_secret: string
  session_enrichment_enabled: boolean
  session_ttl_days: number
  diagnostico_ativo: boolean
  status: 'draft' | 'deployed'
  created_at: string
  updated_at: string
  track_pixels?: PixelRow[]
  track_domains?: DomainRow[]
  track_triggers?: TriggerRow[]
}

export function mapInstallationRow(row: InstallationRow): TrackInstallation {
  const webhookUrl = row.worker_subdomain
    ? `https://${row.worker_subdomain}/webhook/hotmart?secret=${row.webhook_secret}`
    : null

  const pixels: TrackPixel[] = (row.track_pixels ?? []).map(p => ({
    id: p.id,
    pixel_id: p.pixel_id,
    capi_token_masked: maskEncrypted(p.capi_token_encrypted),
    test_event_code: p.test_event_code,
  }))

  const domains: TrackDomain[] = (row.track_domains ?? []).map(d => ({
    id: d.id,
    domain: d.domain,
    tipo: d.tipo,
  }))

  const triggers: TrackTrigger[] = (row.track_triggers ?? []).map(t => ({
    id: t.id,
    tipo: t.tipo,
    meta_event: t.meta_event,
    config: t.config ?? {},
  }))

  return {
    id: row.id,
    nome: row.nome,
    worker_subdomain: row.worker_subdomain,
    cloudflare_api_token_masked: maskEncrypted(row.cloudflare_api_token_encrypted),
    webhook_platform: row.webhook_platform,
    webhook_meta_event: row.webhook_meta_event,
    webhook_secret: row.webhook_secret,
    webhook_url: webhookUrl,
    session_enrichment_enabled: row.session_enrichment_enabled,
    session_ttl_days: row.session_ttl_days,
    diagnostico_ativo: row.diagnostico_ativo,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    pixels,
    domains,
    triggers,
  }
}
