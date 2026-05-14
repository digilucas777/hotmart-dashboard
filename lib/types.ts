export type Status = 'approved' | 'refunded' | 'cancelled' | 'pending'

export type Venda = {
  id: string
  hotmart_id: string
  produto: string
  comprador_nome: string
  comprador_email: string
  valor: number
  moeda: string
  status: Status
  data_venda: string
  forma_pagamento?: string | null
  pais?: string | null
}

export type Projeto = {
  id: string
  nome: string
  descricao?: string | null
  data_criacao?: string | null
}

export type Produto = {
  id: string
  hotmart_id: string
  nome: string
}

export type Period = 'today' | 'yesterday' | '7d' | '30d' | 'thisMonth' | 'lastMonth'

export type WidgetType = 'metric' | 'line' | 'bar' | 'pie' | 'table'

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

export type WidgetWidth = 'full' | 'half'

export interface WidgetConfig {
  id: string
  projeto_id: string
  type: WidgetType
  data_source: WidgetDataSource
  title: string
  width: WidgetWidth
  position: number
}
