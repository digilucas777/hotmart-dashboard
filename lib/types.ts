export type Status = 'approved' | 'refunded' | 'cancelled' | 'pending' | 'abandoned'

export type Venda = {
  id: string
  hotmart_id: string
  hotmart_produto_id?: string | null
  produto: string
  comprador_nome: string
  comprador_email: string
  valor: number
  moeda: string
  status: Status
  data_venda: string
  forma_pagamento?: string | null
  pais?: string | null
  origem?: string | null
}

export type Projeto = {
  id: string
  nome: string
  descricao?: string | null
  capa_url?: string | null
  cor?: string | null
  categoria?: string | null
  imagem_url?: string | null
  status?: string | null
  data_criacao?: string | null
}

export type Produto = {
  id: string
  hotmart_id: string
  nome: string
}

export type Period = 'today' | 'yesterday' | '7d' | '30d' | '90d' | '180d' | '365d' | 'thisMonth' | 'lastMonth'

export type WidgetType =
  | 'metric'
  | 'line'
  | 'bar'
  | 'pie'
  | 'table'
  | 'combined'
  | 'meta-metric'
  | 'meta-chart'
  | 'meta-funnel'
  | 'meta-campaign'
  | 'meta-creative'

export type MetaDataSource =
  | 'meta_spend'
  | 'meta_revenue'
  | 'meta_roas'
  | 'meta_profit'
  | 'meta_roi'
  | 'meta_avg_ticket'
  | 'meta_cpa'
  | 'meta_cpl'
  | 'meta_cpm'
  | 'meta_cpc'
  | 'meta_ctr'
  | 'meta_frequency'
  | 'meta_reach'
  | 'meta_impressions'
  | 'meta_link_clicks'
  | 'meta_conversions'
  | 'meta_leads'
  | 'meta_purchases'
  | 'meta_checkout_initiated'
  | 'meta_add_to_cart'
  | 'meta_page_views'
  | 'meta_landing_page_views'
  | 'meta_spend_by_day'
  | 'meta_roas_by_day'
  | 'meta_conversions_by_day'
  | 'meta_funnel'
  | 'meta_campaigns'
  | 'meta_creatives_ctr'
  | 'meta_creatives_roas'

export type WidgetDataSource =
  | 'total_converted'
  | 'total_brl'
  | 'total_usd'
  | 'sales_count'
  | 'approval_rate'
  | 'avg_ticket'
  | 'refunds_count'
  | 'pending_count'
  | 'cancelled_count'
  | 'revenue_by_day'
  | 'sales_by_day'
  | 'revenue_by_product'
  | 'count_by_product'
  | 'by_payment'
  | 'by_country'
  | 'by_status'
  | 'transactions'
  | 'lucro'
  | 'margem_lucro'
  | 'roas'
  | 'cpa'
  | 'commission'
  | 'combined_by_day'
  | MetaDataSource

export type WidgetWidth = 'full' | 'half' | '1/4' | '1/3' | '1/2' | '2/3' | '3/4'

export type WidgetHeight = 'small' | 'medium' | 'large' | 'extra'

export interface WidgetConfig {
  id: string
  projeto_id: string
  type: WidgetType
  data_source: WidgetDataSource
  title: string
  width: string
  position: number
  height?: string
  col_start?: number | null
  row_start?: number | null
  col_span?: number | null
  row_span?: number | null
}
