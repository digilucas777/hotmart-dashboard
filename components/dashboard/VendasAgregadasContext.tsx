'use client'

import { createContext, useContext } from 'react'
import type { GraficoRow } from '@/lib/vendas-graficos'

// Gráficos somados pelo banco + estado da tabela de transações paginada (250 por vez).
// Vai por contexto pra não ter que passar prop por DashboardGrid > WidgetRenderer > SalesTable.
// graficos === null: período por hora (hoje/ontem) ou combinado, os widgets usam as vendas cruas.
export type VendasAgregadas = {
  graficos: GraficoRow[] | null
  totalVendas: number | null
  temMais: boolean
  carregandoMais: boolean
  carregarMais: (() => void) | null
}

export const VendasAgregadasContext = createContext<VendasAgregadas>({
  graficos: null, totalVendas: null, temMais: false, carregandoMais: false, carregarMais: null,
})

export const useVendasAgregadas = () => useContext(VendasAgregadasContext)
