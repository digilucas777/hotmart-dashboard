export type Status = 'approved' | 'refunded' | 'cancelled' | 'pending' | 'abandoned' | 'chargeback' | 'disputed'

export type Venda = {
  id: string
  hotmart_id: string
  hotmart_produto_id?: string | null
  produto: string
  oferta_codigo?: string | null
  oferta_nome?: string | null
  oferta_descricao?: string | null
  oferta_preco?: number | null
  oferta_moeda?: string | null
  plano_id?: string | null
  plano_nome?: string | null
  comprador_nome: string
  comprador_email: string
  valor: number
  valor_recebido?: number | null
  valor_bruto?: number | null
  taxa_hotmart?: number | null
  comissao_produtor?: number | null
  comissao_coprodutor?: number | null
  comissao_afiliado?: number | null
  valor_operacional_final: number
  moeda: string
  status: Status
  data_venda: string
  forma_pagamento?: string | null
  pais?: string | null
  origem?: string | null
  afiliado_nome?: string | null
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
  ordem?: number | null
  user_id?: string | null
  deleted_at?: string | null
}

export type Produto = {
  id: string
  hotmart_id: string
  nome: string
}

export type Period = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'custom'

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
  | 'meta_roas'
  | 'meta_roas_geral'
  | 'meta_impressions'
  | 'meta_reach'
  | 'meta_frequency'
  | 'meta_cpc'
  | 'meta_cpm'
  | 'meta_ctr'
  | 'meta_link_clicks'
  | 'meta_page_views'
  | 'meta_checkout_initiated'
  | 'meta_purchases'
  | 'meta_add_to_cart'
  | 'meta_valor_compras'
  | 'meta_hook_rate'
  | 'meta_connect_rate'
  | 'meta_spend_by_day'
  | 'meta_roas_by_day'
  | 'meta_conversions_by_day'
  | 'meta_funnel'
  | 'meta_campaigns'
  | 'meta_creatives_ctr'

export type WidgetDataSource =
  | 'total_converted'
  | 'total_brl'
  | 'total_usd'
  | 'sales_count'
  | 'approval_rate'
  | 'avg_ticket'
  | 'refunds_count'
  | 'chargebacks_count'
  | 'disputed_count'
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
  | 'lucro_usd'
  | 'margem_lucro'
  | 'roas'
  | 'cpa'
  | 'commission'
  | 'comissao_33'
  | 'combined_by_day'
  | 'top_produtos'
  | 'todos_produtos'
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
