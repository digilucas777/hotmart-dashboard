export type Status = 'approved' | 'refunded' | 'cancelled' | 'pending'

export type Venda = {
  id: string
  hotmart_id: string
  produto: string
  comprador_nome: string
  comprador_email: string
  valor: number
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
