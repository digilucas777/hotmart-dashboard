'use client'

import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { Badge, type BadgeVariant } from '@/components/ui/Badge'
import {
  formatBRL,
  formatUSD,
  formatDateTime,
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
}: {
  vendas: Venda[]
  exchangeRate: number
  initialStatusFilter?: string
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
    'Valor BRL',
    'Valor USD',
    'Status',
    'Origem',
  ]

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-white/7 bg-[#191929]">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-col gap-3 border-b border-white/7 p-5 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Transações</h3>
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => changeStatus(f.value)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                statusFilter === f.value
                  ? 'bg-indigo-500 text-white'
                  : 'bg-white/5 text-slate-500 hover:bg-white/10 hover:text-slate-300'
              }`}
            >
              {f.label}
            </button>
          ))}
          <div className="relative">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600"
            />
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={e => changeSearch(e.target.value)}
              className="w-36 rounded-lg bg-white/5 py-1 pl-8 pr-3 text-xs text-slate-200 placeholder-slate-600 outline-none ring-1 ring-white/8 focus:ring-indigo-500/50"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[1100px]">
          <thead className="sticky top-0 z-10 bg-[#191929]">
            <tr className="border-b border-white/5">
              {COLS.map(col => (
                <th
                  key={col}
                  className="px-5 py-3 text-left text-xs font-medium text-slate-600"
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
                  colSpan={10}
                  className="px-5 py-12 text-center text-sm text-slate-600"
                >
                  Nenhuma transação encontrada
                </td>
              </tr>
            ) : (
              filtered.map(v => (
                <tr
                  key={v.id}
                  className="border-b border-white/4 transition-colors last:border-0 hover:bg-white/2"
                >
                  <td className="px-5 py-3.5 font-mono text-xs text-slate-500">
                    {formatDateTime(v.data_venda)}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-slate-500">
                    {v.hotmart_id ? (
                      <span title={v.hotmart_id} className="block max-w-[100px] truncate">
                        {v.hotmart_id}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="text-xs font-medium text-slate-200">
                      {v.comprador_nome ?? '—'}
                    </p>
                    <p className="text-xs text-slate-600">
                      {v.comprador_email ?? '—'}
                    </p>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-400 [word-break:break-word]">
                    {v.produto ?? '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge variant={v.forma_pagamento ? 'info' : 'default'}>
                      {normalizePagamento(v.forma_pagamento)}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-500">
                    {v.pais ?? '—'}
                  </td>
                  <td className="px-5 py-3.5 text-xs font-semibold tabular-nums text-slate-200">
                    {v.moeda === 'USD'
                      ? formatBRL((v.valor ?? 0) * exchangeRate)
                      : formatBRL(v.valor ?? 0)}
                  </td>
                  <td className="px-5 py-3.5 text-xs tabular-nums text-slate-500">
                    {v.moeda === 'USD'
                      ? formatUSD(v.valor ?? 0)
                      : '—'}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge variant={STATUS_VARIANT[v.status] ?? 'default'}>
                      {statusLabel(v.status)}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-500">
                    {parseOrigem(v.origem)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="shrink-0 border-t border-white/7 px-5 py-3">
        <p className="text-xs text-slate-600">
          {filtered.length} transaç{filtered.length === 1 ? 'ão' : 'ões'}
        </p>
      </div>
    </div>
  )
}
