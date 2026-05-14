'use client'

import { useState, useMemo } from 'react'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge, type BadgeVariant } from '@/components/ui/Badge'
import {
  formatBRL,
  formatUSD,
  formatDateTime,
  statusLabel,
  normalizePagamento,
} from '@/lib/utils'
import type { Venda } from '@/lib/types'

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  approved: 'success',
  refunded: 'danger',
  cancelled: 'warning',
  pending: 'info',
}

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'approved', label: 'Aprovados' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'refunded', label: 'Reembolsados' },
  { value: 'cancelled', label: 'Cancelado' },
]

const PAGE_SIZE = 25

export function SalesTable({
  vendas,
  exchangeRate,
}: {
  vendas: Venda[]
  exchangeRate: number
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('approved')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return vendas.filter(v => {
      const matchSearch =
        !q ||
        v.comprador_nome?.toLowerCase().includes(q) ||
        v.comprador_email?.toLowerCase().includes(q) ||
        v.produto?.toLowerCase().includes(q)
      const matchStatus =
        statusFilter === 'all' || v.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [vendas, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  )

  function changeStatus(s: string) {
    setStatusFilter(s)
    setPage(1)
  }

  function changeSearch(v: string) {
    setSearch(v)
    setPage(1)
  }

  const COLS = [
    'Data/hora',
    'Comprador',
    'Produto',
    'Pagamento',
    'País',
    'Valor BRL',
    'Valor USD',
    'Status',
  ]

  return (
    <div className="rounded-2xl border border-white/7 bg-[#191929]">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-white/7 p-5 sm:flex-row sm:items-center sm:justify-between">
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
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead>
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
            {paginated.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-5 py-12 text-center text-sm text-slate-600"
                >
                  Nenhuma transação encontrada
                </td>
              </tr>
            ) : (
              paginated.map(v => (
                <tr
                  key={v.id}
                  className="border-b border-white/4 transition-colors last:border-0 hover:bg-white/2"
                >
                  <td className="px-5 py-3.5 font-mono text-xs text-slate-500">
                    {formatDateTime(v.data_venda)}
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="text-xs font-medium text-slate-200">
                      {v.comprador_nome ?? '—'}
                    </p>
                    <p className="text-xs text-slate-600">
                      {v.comprador_email ?? '—'}
                    </p>
                  </td>
                  <td className="max-w-[160px] truncate px-5 py-3.5 text-xs text-slate-400">
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
                    {formatBRL(v.valor ?? 0)}
                  </td>
                  <td className="px-5 py-3.5 text-xs tabular-nums text-slate-500">
                    {formatUSD((v.valor ?? 0) / exchangeRate)}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge variant={STATUS_VARIANT[v.status] ?? 'default'}>
                      {statusLabel(v.status)}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-white/7 px-5 py-3">
        <p className="text-xs text-slate-600">
          {filtered.length} transaç{filtered.length === 1 ? 'ão' : 'ões'}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="rounded p-1 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300 disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-1 text-xs text-slate-500">
              {safePage} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="rounded p-1 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300 disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}