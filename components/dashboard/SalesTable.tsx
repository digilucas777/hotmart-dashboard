'use client'

import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { Badge, type BadgeVariant } from '@/components/ui/Badge'
import {
  formatBRL,
  formatUSD,
  formatDateTime,
  getOfficialSaleAmount,
  statusLabel,
  normalizePagamento,
  parseOrigem,
} from '@/lib/utils'
import type { Venda } from '@/lib/types'

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  approved: 'success',
  refunded: 'danger',
  cancelled: 'warning',
  pending: 'info',
  abandoned: 'default',
}

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'approved', label: 'Aprovados' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'refunded', label: 'Reembolsados' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'abandoned', label: 'Abandono' },
]

export function SalesTable({
  vendas,
  exchangeRate,
  initialStatusFilter = 'approved',
  heightMode = 'viewport',
}: {
  vendas: Venda[]
  exchangeRate: number
  initialStatusFilter?: string
  heightMode?: 'viewport' | 'fill'
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return vendas.filter(v => {
      const matchSearch =
        !q ||
        v.comprador_nome?.toLowerCase().includes(q) ||
        v.comprador_email?.toLowerCase().includes(q) ||
        v.produto?.toLowerCase().includes(q) ||
        v.hotmart_id?.toLowerCase().includes(q)
      const matchStatus =
        statusFilter === 'all' || v.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [vendas, search, statusFilter])

  function changeStatus(s: string) {
    setStatusFilter(s)
  }

  function changeSearch(v: string) {
    setSearch(v)
  }

  const COLS = [
    'Data/hora',
    'Código HP',
    'Comprador',
    'Produto',
    'Pagamento',
    'País',
    'Valor',
    'Status',
    'Origem',
  ]

  const heightClass = heightMode === 'fill'
    ? 'h-full'
    : 'h-[calc(100vh-260px)] min-h-[360px]'

  return (
    <div className={`dashboard-card flex ${heightClass} min-h-0 flex-col rounded-2xl`}>
      {/* Toolbar */}
      <div className="relative z-[1] flex shrink-0 flex-col gap-3 border-b border-[var(--dash-border)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-[var(--dash-text)]">Transações</h3>
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => changeStatus(f.value)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                statusFilter === f.value
                  ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white shadow-lg shadow-cyan-500/15'
                  : 'bg-white/5 text-[var(--dash-faint)] hover:bg-white/10 hover:text-[var(--dash-text)]'
              }`}
            >
              {f.label}
            </button>
          ))}
          <div className="relative">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--dash-faint)]"
            />
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={e => changeSearch(e.target.value)}
              className="w-36 rounded-lg bg-white/5 py-1 pl-8 pr-3 text-xs text-[var(--dash-text)] placeholder-[var(--dash-faint)] outline-none ring-1 ring-[var(--dash-border)] focus:ring-cyan-400/50"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="relative z-[1] min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[1100px]">
          <thead className="sticky top-0 z-10 bg-[var(--dash-panel-strong)] backdrop-blur-xl">
            <tr className="border-b border-[var(--dash-border)]">
              {COLS.map(col => (
                <th
                  key={col}
                  className="px-4 py-2.5 text-left text-xs font-medium text-[var(--dash-faint)]"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-5 py-12 text-center text-sm text-[var(--dash-faint)]"
                >
                  Nenhuma transação encontrada
                </td>
              </tr>
            ) : (
              filtered.map(v => {
                const amount = getOfficialSaleAmount(v)
                return (
                <tr
                  key={v.id}
                  className="border-b border-[var(--dash-border)]/60 transition-colors last:border-0 hover:bg-white/5"
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-[var(--dash-faint)]">
                    {formatDateTime(v.data_venda)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-[var(--dash-faint)]">
                    {v.hotmart_id ? (
                      <span title={v.hotmart_id} className="block max-w-[100px] truncate">
                        {v.hotmart_id}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-xs font-medium text-[var(--dash-text)]">
                      {v.comprador_nome ?? '—'}
                    </p>
                    <p className="text-xs text-[var(--dash-faint)]">
                      {v.comprador_email ?? '—'}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[var(--dash-muted)] [word-break:break-word]">
                    {v.produto ?? '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={v.forma_pagamento ? 'info' : 'default'}>
                      {normalizePagamento(v.forma_pagamento)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[var(--dash-faint)]">
                    {v.pais ?? '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    {v.moeda === 'USD' ? (
                      <div>
                        <p className="text-xs font-semibold tabular-nums text-[var(--dash-text)]">{formatUSD(amount)}</p>
                        <p className="mt-0.5 text-[10px] tabular-nums text-[var(--dash-faint)]">≈ {formatBRL(amount * exchangeRate)}</p>
                      </div>
                    ) : (
                      <p className="text-xs font-semibold tabular-nums text-[var(--dash-text)]">{formatBRL(amount)}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={STATUS_VARIANT[v.status] ?? 'default'}>
                      {statusLabel(v.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[var(--dash-faint)]">
                    {parseOrigem(v.origem)}
                  </td>
                </tr>
              )})
            )}
          </tbody>
        </table>
      </div>

      <div className="relative z-[1] shrink-0 border-t border-[var(--dash-border)] px-4 py-2">
        <p className="text-xs text-[var(--dash-faint)]">
          {filtered.length} transaç{filtered.length === 1 ? 'ão' : 'ões'}
        </p>
      </div>
    </div>
  )
}
