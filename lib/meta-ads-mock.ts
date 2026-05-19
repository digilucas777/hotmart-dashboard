import type { Period, WidgetDataSource } from './types'

function seededRandom(seed: number) {
  let s = Math.abs(seed) + 1
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

const PERIOD_DAYS: Partial<Record<Period, number>> = {
  today: 1,
  yesterday: 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '180d': 180,
  '365d': 365,
  thisMonth: 25,
  lastMonth: 30,
}

function periodDays(period: Period): number {
  return periodDays(period) ?? 30
}

function generateDates(period: Period): string[] {
  const days = Math.min(30, periodDays(period))
  const now = new Date()
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - (days - 1 - i))
    return d.toISOString().split('T')[0]!
  })
}

// ─── Result types ─────────────────────────────────────────────────────────────

export type MetaMetricResult = {
  kind: 'meta-metric'
  value: number
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
  sortBy: 'ctr' | 'roas'
  creatives: {
    id: string
    name: string
    adType: 'image' | 'video'
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

// ─── Metric config map ────────────────────────────────────────────────────────

type MetricCfg = {
  label: string
  icon: string
  accentColor: string
  format: MetaMetricResult['format']
  isGoodWhenUp: boolean
  baseValue: number
  periodScaled: boolean
}

const METRIC_CONFIG: Record<string, MetricCfg> = {
  meta_spend:             { label: 'Gasto Total',             icon: '💸', accentColor: '#f59e0b', format: 'currency_brl', isGoodWhenUp: false, baseValue: 500,   periodScaled: true  },
  meta_revenue:           { label: 'Receita',                 icon: '💰', accentColor: '#10b981', format: 'currency_brl', isGoodWhenUp: true,  baseValue: 1500,  periodScaled: true  },
  meta_roas:              { label: 'ROAS',                    icon: '📈', accentColor: '#6366f1', format: 'multiplier',   isGoodWhenUp: true,  baseValue: 3.2,   periodScaled: false },
  meta_profit:            { label: 'Lucro Estimado',          icon: '🏆', accentColor: '#10b981', format: 'currency_brl', isGoodWhenUp: true,  baseValue: 1000,  periodScaled: true  },
  meta_roi:               { label: 'ROI',                     icon: '🎯', accentColor: '#8b5cf6', format: 'percentage',   isGoodWhenUp: true,  baseValue: 120,   periodScaled: false },
  meta_avg_ticket:        { label: 'Ticket Médio',            icon: '🎫', accentColor: '#06b6d4', format: 'currency_brl', isGoodWhenUp: true,  baseValue: 197,   periodScaled: false },
  meta_cpa:               { label: 'CPA',                     icon: '🎯', accentColor: '#ef4444', format: 'currency_brl', isGoodWhenUp: false, baseValue: 85,    periodScaled: false },
  meta_cpl:               { label: 'CPL',                     icon: '🧲', accentColor: '#f97316', format: 'currency_brl', isGoodWhenUp: false, baseValue: 12,    periodScaled: false },
  meta_cpm:               { label: 'CPM',                     icon: '👁',  accentColor: '#64748b', format: 'currency_brl', isGoodWhenUp: false, baseValue: 32,    periodScaled: false },
  meta_cpc:               { label: 'CPC',                     icon: '🖱',  accentColor: '#64748b', format: 'currency_brl', isGoodWhenUp: false, baseValue: 2.8,   periodScaled: false },
  meta_ctr:               { label: 'CTR',                     icon: '⚡',  accentColor: '#eab308', format: 'percentage',   isGoodWhenUp: true,  baseValue: 2.5,   periodScaled: false },
  meta_frequency:         { label: 'Frequência',              icon: '🔄', accentColor: '#64748b', format: 'decimal',      isGoodWhenUp: false, baseValue: 2.1,   periodScaled: false },
  meta_reach:             { label: 'Alcance',                 icon: '📡', accentColor: '#06b6d4', format: 'number',       isGoodWhenUp: true,  baseValue: 25000, periodScaled: true  },
  meta_impressions:       { label: 'Impressões',              icon: '👁',  accentColor: '#6366f1', format: 'number',       isGoodWhenUp: true,  baseValue: 50000, periodScaled: true  },
  meta_link_clicks:       { label: 'Cliques no Link',         icon: '🔗', accentColor: '#06b6d4', format: 'number',       isGoodWhenUp: true,  baseValue: 1200,  periodScaled: true  },
  meta_conversions:       { label: 'Conversões',              icon: '✅', accentColor: '#10b981', format: 'number',       isGoodWhenUp: true,  baseValue: 18,    periodScaled: true  },
  meta_leads:             { label: 'Leads',                   icon: '🧲', accentColor: '#8b5cf6', format: 'number',       isGoodWhenUp: true,  baseValue: 60,    periodScaled: true  },
  meta_purchases:         { label: 'Compras',                 icon: '🛒', accentColor: '#10b981', format: 'number',       isGoodWhenUp: true,  baseValue: 12,    periodScaled: true  },
  meta_checkout_initiated:{ label: 'Checkouts Iniciados',     icon: '💳', accentColor: '#f59e0b', format: 'number',       isGoodWhenUp: true,  baseValue: 25,    periodScaled: true  },
  meta_add_to_cart:       { label: 'Adições ao Carrinho',     icon: '🛒', accentColor: '#f97316', format: 'number',       isGoodWhenUp: true,  baseValue: 45,    periodScaled: true  },
  meta_page_views:        { label: 'Visualizações de Página', icon: '📄', accentColor: '#64748b', format: 'number',       isGoodWhenUp: true,  baseValue: 2500,  periodScaled: true  },
  meta_landing_page_views:{ label: 'Landing Page Views',      icon: '🏠', accentColor: '#64748b', format: 'number',       isGoodWhenUp: true,  baseValue: 1800,  periodScaled: true  },
}

function getMetricValue(source: string, period: Period): number {
  const cfg = METRIC_CONFIG[source]
  if (!cfg) return 0
  const days = periodDays(period)
  const rng = seededRandom(hashStr(source + period))
  const variance = 0.75 + rng() * 0.5 // 0.75 to 1.25
  const raw = cfg.baseValue * (cfg.periodScaled ? days : 1) * variance
  if (cfg.format === 'multiplier' || cfg.format === 'decimal') return parseFloat(raw.toFixed(2))
  if (cfg.format === 'percentage') return parseFloat(raw.toFixed(1))
  return Math.round(raw)
}

function getMetricChange(source: string): number {
  const rng = seededRandom(hashStr(source + 'change99'))
  return parseFloat(((rng() * 55) - 15).toFixed(1)) // -15% to +40%
}

// ─── Main function ────────────────────────────────────────────────────────────

export function computeMetaWidgetData(dataSource: WidgetDataSource, period: Period): MetaWidgetData {
  const src = String(dataSource)

  // ── Single metric ──
  if (src in METRIC_CONFIG) {
    const cfg = METRIC_CONFIG[src]!
    return {
      kind: 'meta-metric',
      value: getMetricValue(src, period),
      label: cfg.label,
      format: cfg.format,
      change: getMetricChange(src),
      isGoodWhenUp: cfg.isGoodWhenUp,
      icon: cfg.icon,
      accentColor: cfg.accentColor,
    }
  }

  // ── Spend + Revenue chart ──
  if (src === 'meta_spend_by_day') {
    const dates = generateDates(period)
    const rng = seededRandom(hashStr('spend_by_day' + period))
    return {
      kind: 'meta-chart',
      metric: 'Gasto',
      metric2: 'Receita',
      format: 'currency_brl',
      points: dates.map(date => ({
        date,
        value: Math.round(300 + rng() * 700),
        value2: Math.round(900 + rng() * 2100),
      })),
    }
  }

  // ── ROAS over time ──
  if (src === 'meta_roas_by_day') {
    const dates = generateDates(period)
    const rng = seededRandom(hashStr('roas_by_day' + period))
    return {
      kind: 'meta-chart',
      metric: 'ROAS',
      format: 'multiplier',
      points: dates.map(date => ({
        date,
        value: parseFloat((1.8 + rng() * 3.2).toFixed(2)),
      })),
    }
  }

  // ── Conversions + Leads over time ──
  if (src === 'meta_conversions_by_day') {
    const dates = generateDates(period)
    const rng = seededRandom(hashStr('conv_by_day' + period))
    return {
      kind: 'meta-chart',
      metric: 'Conversões',
      metric2: 'Leads',
      format: 'number',
      points: dates.map(date => ({
        date,
        value: Math.round(4 + rng() * 22),
        value2: Math.round(18 + rng() * 70),
      })),
    }
  }

  // ── Conversion funnel ──
  if (src === 'meta_funnel') {
    const days = periodDays(period)
    const rng = seededRandom(hashStr('funnel' + period))
    const impressions = Math.round(48000 * days * (0.8 + rng() * 0.4))
    const clicks      = Math.round(impressions  * (0.020 + rng() * 0.025))
    const leads       = Math.round(clicks       * (0.040 + rng() * 0.040))
    const checkouts   = Math.round(leads        * (0.350 + rng() * 0.200))
    const purchases   = Math.round(checkouts    * (0.400 + rng() * 0.200))
    const spend       = Math.round(500 * days   * (0.8 + rng() * 0.4))

    return {
      kind: 'meta-funnel',
      steps: [
        { label: 'Impressões', icon: '👁',  count: impressions, cost: 0 },
        { label: 'Cliques',    icon: '🖱',  count: clicks,      cost: clicks > 0 ? spend / clicks : 0,     conversionRate: impressions > 0 ? clicks / impressions : 0 },
        { label: 'Leads',      icon: '🧲',  count: leads,       cost: leads > 0 ? spend / leads : 0,       conversionRate: clicks > 0 ? leads / clicks : 0 },
        { label: 'Checkout',   icon: '💳',  count: checkouts,   cost: checkouts > 0 ? spend / checkouts : 0, conversionRate: leads > 0 ? checkouts / leads : 0 },
        { label: 'Compra',     icon: '✅',  count: purchases,   cost: purchases > 0 ? spend / purchases : 0, conversionRate: checkouts > 0 ? purchases / checkouts : 0 },
      ],
    }
  }

  // ── Campaigns table ──
  if (src === 'meta_campaigns') {
    const days = periodDays(period)
    const rng = seededRandom(hashStr('campaigns' + period))
    const names = [
      'Tráfego Frio — Conversão',
      'Remarketing 7 dias',
      'LAL 3% Compradores',
      'Escala — Broad',
      'Branding — Views',
    ]
    const statuses: ('ACTIVE' | 'PAUSED')[] = ['ACTIVE', 'ACTIVE', 'ACTIVE', 'PAUSED', 'ACTIVE']

    return {
      kind: 'meta-campaign',
      campaigns: names.map((name, i) => {
        const spend       = Math.round(120 * days * (0.4 + rng() * 1.6))
        const roas        = parseFloat((1.6 + rng() * 4.0).toFixed(2))
        const revenue     = Math.round(spend * roas)
        const conversions = Math.max(1, Math.round(spend / (55 + rng() * 110)))
        const impressions = Math.round(12000 * days * (0.5 + rng() * 1.0))
        const clicks      = Math.round(impressions * (0.012 + rng() * 0.038))
        return {
          id: `camp_${i}`,
          name,
          status: statuses[i] ?? 'ACTIVE',
          spend,
          revenue,
          roas,
          cpa: parseFloat((spend / conversions).toFixed(2)),
          conversions,
          ctr: parseFloat(((clicks / impressions) * 100).toFixed(2)),
          reach: Math.round(impressions * 0.72),
        }
      }),
    }
  }

  // ── Creatives ranking ──
  if (src === 'meta_creatives_ctr' || src === 'meta_creatives_roas') {
    const sortBy = src === 'meta_creatives_ctr' ? 'ctr' : 'roas'
    const days = periodDays(period)
    const rng = seededRandom(hashStr('creatives' + period + src))
    const names = [
      'Ad Depoimento — Lucas v2',
      'VSL 47s Black Friday',
      'Carrossel Produto Hero',
      'Story Urgência 30s',
      'UGC Prova Social',
      'Estática Oferta Direta',
    ]
    const adTypes: ('image' | 'video')[] = ['video', 'video', 'image', 'video', 'video', 'image']

    const creatives = names.map((name, i) => {
      const impressions = Math.round(9000 * days * (0.4 + rng() * 1.2))
      const ctr         = parseFloat((0.9 + rng() * 4.2).toFixed(2))
      const clicks      = Math.round((impressions * ctr) / 100)
      const spend       = Math.round(160 * days * (0.3 + rng() * 1.2))
      const roas        = parseFloat((1.6 + rng() * 4.4).toFixed(2))
      const conversions = Math.max(1, Math.round(spend / (65 + rng() * 120)))
      return {
        id: `cr_${i}`,
        name,
        adType: adTypes[i] ?? 'image',
        ctr,
        roas,
        spend,
        impressions,
        clicks,
        conversions,
      }
    })

    creatives.sort((a, b) => (sortBy === 'ctr' ? b.ctr - a.ctr : b.roas - a.roas))

    return { kind: 'meta-creative', sortBy, creatives }
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
