import type { Period, WidgetDataSource } from './types'

// ─── Result types ─────────────────────────────────────────────────────────────

export type MetaMetricResult = {
  kind: 'meta-metric'
  value: number
  valueUsd?: number
  label: string
  format: 'currency_brl' | 'percentage' | 'number' | 'multiplier' | 'decimal'
  change: number
  isGoodWhenUp: boolean
  icon: string
  accentColor: string
}

export type MetaFunnelResult = {
  kind: 'meta-funnel'
  steps: {
    label: string
    icon: string
    count: number
    cost: number
    conversionRate?: number
  }[]
}

export type MetaChartResult = {
  kind: 'meta-chart'
  points: { date: string; value: number; value2?: number }[]
  metric: string
  metric2?: string
  format: 'currency_brl' | 'percentage' | 'number' | 'multiplier'
}

export type MetaCampaignResult = {
  kind: 'meta-campaign'
  campaigns: {
    id: string
    name: string
    account_name?: string
    status: 'ACTIVE' | 'PAUSED'
    spend: number
    revenue: number
    roas: number
    cpa: number
    conversions: number
    ctr: number
    reach: number
  }[]
}

export type MetaCreativeResult = {
  kind: 'meta-creative'
  sortBy: 'ctr' | 'roas'  // 'roas' kept for real API data compatibility
  creatives: {
    id: string
    name: string
    adType: 'image' | 'video'
    thumbnailUrl?: string
    ctr: number
    roas: number
    spend: number
    impressions: number
    clicks: number
    conversions: number
  }[]
}

export type MetaWidgetData =
  | MetaMetricResult
  | MetaFunnelResult
  | MetaChartResult
  | MetaCampaignResult
  | MetaCreativeResult

// ─── Metric config (metadata only — nunca mais gera valor fake) ───────────────

type MetricCfg = {
  label: string
  icon: string
  accentColor: string
  format: MetaMetricResult['format']
  isGoodWhenUp: boolean
}

const METRIC_CONFIG: Record<string, MetricCfg> = {
  meta_spend:              { label: 'Gasto Total',             icon: '💸', accentColor: '#f59e0b', format: 'currency_brl', isGoodWhenUp: false },
  meta_roas:               { label: 'ROAS (Meta Ads)',          icon: '📈', accentColor: '#6366f1', format: 'multiplier',   isGoodWhenUp: true },
  meta_roas_geral:         { label: 'ROAS (Geral)',             icon: '📊', accentColor: '#8b5cf6', format: 'multiplier',   isGoodWhenUp: true },
  meta_impressions:        { label: 'Impressões',               icon: '👁',  accentColor: '#6366f1', format: 'number',       isGoodWhenUp: true },
  meta_reach:              { label: 'Alcance',                  icon: '📡', accentColor: '#06b6d4', format: 'number',       isGoodWhenUp: true },
  meta_frequency:          { label: 'Frequência',               icon: '🔄', accentColor: '#64748b', format: 'decimal',      isGoodWhenUp: false },
  meta_cpc:                { label: 'CPC',                      icon: '🖱',  accentColor: '#64748b', format: 'currency_brl', isGoodWhenUp: false },
  meta_cpm:                { label: 'CPM',                      icon: '👁',  accentColor: '#64748b', format: 'currency_brl', isGoodWhenUp: false },
  meta_ctr:                { label: 'CTR',                      icon: '⚡',  accentColor: '#eab308', format: 'percentage',   isGoodWhenUp: true },
  meta_link_clicks:        { label: 'Cliques no Link',          icon: '🔗', accentColor: '#06b6d4', format: 'number',       isGoodWhenUp: true },
  meta_page_views:         { label: 'Visualizações de Página',  icon: '📄', accentColor: '#64748b', format: 'number',       isGoodWhenUp: true },
  meta_checkout_initiated: { label: 'Checkouts Iniciados',      icon: '💳', accentColor: '#f59e0b', format: 'number',       isGoodWhenUp: true },
  meta_purchases:          { label: 'Compras',                  icon: '🛒', accentColor: '#10b981', format: 'number',       isGoodWhenUp: true },
  meta_add_to_cart:        { label: 'Adições ao Carrinho',      icon: '🛒', accentColor: '#f97316', format: 'number',       isGoodWhenUp: true },
  meta_valor_compras:      { label: 'Valor de Compras',         icon: '💰', accentColor: '#10b981', format: 'currency_brl', isGoodWhenUp: true },
  meta_hook_rate:          { label: 'Hook Rate',                icon: '🎣', accentColor: '#8b5cf6', format: 'percentage',   isGoodWhenUp: true },
  meta_connect_rate:       { label: 'Connect Rate',             icon: '🔗', accentColor: '#06b6d4', format: 'percentage',   isGoodWhenUp: true },
}

const FUNNEL_STEPS: { label: string; icon: string }[] = [
  { label: 'Impressões', icon: '👁' },
  { label: 'Cliques',    icon: '🖱' },
  { label: 'Leads',      icon: '🧲' },
  { label: 'Checkout',   icon: '💳' },
  { label: 'Compra',     icon: '✅' },
]

// ─── Main function ────────────────────────────────────────────────────────────
// Sem conta do Meta Ads vinculada (ou sem dado real equivalente), NUNCA inventa
// número — devolve a mesma "forma" de dado zerada/vazia, pro widget renderizar
// "sem dados" em vez de um valor de demonstração que pode ser confundido com
// dado de verdade (já aconteceu — usuário achou que $X gasto era real).
export function computeMetaWidgetData(dataSource: WidgetDataSource, _period: Period): MetaWidgetData {
  const src = String(dataSource)

  if (src in METRIC_CONFIG) {
    const cfg = METRIC_CONFIG[src]!
    return {
      kind: 'meta-metric',
      value: 0,
      label: cfg.label,
      format: cfg.format,
      change: 0,
      isGoodWhenUp: cfg.isGoodWhenUp,
      icon: cfg.icon,
      accentColor: cfg.accentColor,
    }
  }

  if (src === 'meta_spend_by_day') {
    return { kind: 'meta-chart', metric: 'Gasto', metric2: 'Receita', format: 'currency_brl', points: [] }
  }

  if (src === 'meta_roas_by_day') {
    return { kind: 'meta-chart', metric: 'ROAS', format: 'multiplier', points: [] }
  }

  if (src === 'meta_conversions_by_day') {
    return { kind: 'meta-chart', metric: 'Conversões', metric2: 'Leads', format: 'number', points: [] }
  }

  if (src === 'meta_funnel') {
    return {
      kind: 'meta-funnel',
      steps: FUNNEL_STEPS.map(s => ({ ...s, count: 0, cost: 0, conversionRate: undefined })),
    }
  }

  if (src === 'meta_campaigns') {
    return { kind: 'meta-campaign', campaigns: [] }
  }

  if (src === 'meta_creatives_ctr') {
    return { kind: 'meta-creative', sortBy: 'ctr', creatives: [] }
  }

  // Fallback
  return {
    kind: 'meta-metric',
    value: 0,
    label: 'Métrica',
    format: 'number',
    change: 0,
    isGoodWhenUp: true,
    icon: '📊',
    accentColor: '#6366f1',
  }
}
