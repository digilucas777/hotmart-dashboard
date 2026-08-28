export type TrackDomainTipo = 'lp' | 'checkout'

export type TrackTriggerTipo =
  | 'scroll'
  | 'form_submit'
  | 'click_link'
  | 'click_element'
  | 'url_visited'
  | 'time_on_page'
  | 'video_progress'

export type TrackPixel = {
  id: string
  pixel_id: string
  capi_token_masked: string | null
  test_event_code: string | null
}

export type TrackDomain = {
  id: string
  domain: string
  tipo: TrackDomainTipo
}

export type TrackTrigger = {
  id: string
  tipo: TrackTriggerTipo
  meta_event: string
  config: Record<string, unknown>
  ativo: boolean
}

export type TrackInstallation = {
  id: string
  nome: string
  worker_subdomain: string | null
  cloudflare_api_token_masked: string | null
  webhook_platform: string
  webhook_meta_event: string
  webhook_secret: string
  webhook_url: string | null
  session_enrichment_enabled: boolean
  session_ttl_days: number
  diagnostico_ativo: boolean
  require_tracker_src: boolean
  meta_purchase_product_ids: string[]
  status: 'draft' | 'deployed'
  created_at: string
  updated_at: string
  pixels: TrackPixel[]
  domains: TrackDomain[]
  triggers: TrackTrigger[]
}

export type TrackPixelInput = {
  id?: string
  pixel_id: string
  capi_token?: string
  test_event_code?: string | null
}

export type TrackDomainInput = {
  id?: string
  domain: string
  tipo: TrackDomainTipo
}

export type TrackTriggerInput = {
  id?: string
  tipo: TrackTriggerTipo
  meta_event: string
  config?: Record<string, unknown>
  ativo?: boolean
}

export type TrackInstallationSaveInput = {
  id?: string
  nome: string
  worker_subdomain?: string | null
  cloudflare_api_token?: string
  webhook_meta_event?: string
  session_enrichment_enabled?: boolean
  session_ttl_days?: number
  diagnostico_ativo?: boolean
  require_tracker_src?: boolean
  meta_purchase_product_ids?: string[]
  pixels?: TrackPixelInput[]
  domains?: TrackDomainInput[]
  triggers?: TrackTriggerInput[]
}
