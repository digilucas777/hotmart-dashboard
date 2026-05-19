'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ShoppingCart, RefreshCw, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { SalesTable } from '@/components/dashboard/SalesTable'
import { PeriodFilter } from '@/components/dashboard/PeriodFilter'
import { getPeriodRange } from '@/lib/utils'
import type { Venda, Produto, Period } from '@/lib/types'
import { Spinner } from '@/components/ui/Spinner'
import { MultiSelect } from '@/components/ui/MultiSelect'

const STATUS_OPTIONS = [
  { value: 'approved', label: 'Aprovado' },
  { value: 'pending', label: 'Pendente' },
  { value: 'refunded', label: 'Reembolsado' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'abandoned', label: 'Abandono' },
]

export default function VendasPage() {
  const [vendas, setVendas] = useState<Venda[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [exchangeRate, setExchangeRate] = useState(5.85)

  const [period, setPeriod] = useState<Period>('30d')
  const [customFrom, setCustomFrom] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [customTo, setCustomTo] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })

  const [produtoFilter, setProdutoFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [origemFilter, setOrigemFilter] = useState('')
  const [origemInput, setOrigemInput] = useState('')

  const customDateRange = useMemo(() => {
    if (period !== 'custom') return undefined
    const parseLocal = (s: string) => {
      const [y, m, d] = s.split('-').map(Number)
      return new Date(y!, m! - 1, d!)
    }
    return {
      from: parseLocal(customFrom),
      to: new Date(parseLocal(customTo).getTime() + 86_400_000),
    }
  }, [period, customFrom, customTo])

  useEffect(() => {
    fetch('/api/exchange-rate')
      .then(r => r.json())
      .then((d: { rate: number }) => setExchangeRate(d.rate ?? 5.85))
      .catch(() => {})
  }, [])

  useEffect(() => {
    supabase
      .from('produtos')
      .select('*')
      .order('nome')
      .then(({ data }) => setProdutos((data ?? []) as Produto[]))
  }, [])

  const fetchVendas = useCallback(async () => {
    setLoading(true)
    try {
      const { from, to } = getPeriodRange(period, customDateRange)

      let query = supabase
        .from('vendas')
        .select('*')
        .order('data_venda', { ascending: false })
        .gte('data_venda', from.toISOString())
        .lt('data_venda', to.toISOString())

      if (produtoFilter.length > 0) {
        const hotmartIds = produtos
          .filter(p => produtoFilter.includes(p.id))
          .map(p => p.hotmart_id)
        if (hotmartIds.length > 0) query = query.in('hotmart_produto_id', hotmartIds)
      }

      if (statusFilter.length > 0) query = query.in('status', statusFilter)
      if (origemFilter) query = query.ilike('origem', `%${origemFilter}%`)

      const { data } = await query
      setVendas((data ?? []) as Venda[])
    } finally {
      setLoading(false)
    }
  }, [period, customDateRange, produtoFilter, statusFilter, origemFilter, produtos])

  useEffect(() => {
    fetchVendas()
  }, [fetchVendas])

  function applyOrigem() {
    setOrigemFilter(origemInput)
  }

  const hasFilters = produtoFilter.length > 0 || statusFilter.length > 0 || origemFilter

  return (
    <div className="min-h-screen">
      <header
        className="sticky top-0 z-40 border-b"
        style={{
          borderColor: 'rgba(255,255,255,0.07)',
          background: 'rgba(11,11,20,0.85)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2.5 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20">
            <ShoppingCart size={15} className="text-indigo-400" />
          </div>
          <span className="text-sm font-bold text-slate-100">Vendas</span>
          {!loading && (
            <span
              className="rounded-full px-2 py-0.5 text-xs text-slate-500"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              {vendas.length} transações
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-8">
        {/* Period filter */}
        <div className="mb-5">
          <PeriodFilter
            value={period}
            onChange={setPeriod}
            customFrom={customFrom}
            customTo={customTo}
            onCustomChange={(from, to) => { setCustomFrom(from); setCustomTo(to) }}
          />
        </div>

        {/* Filter bar */}
        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-white/7 bg-[#191929] p-5">
          <MultiSelect
            label="Produto"
            options={produtos.map(p => ({ value: p.id, label: p.nome }))}
            values={produtoFilter}
            onChange={setProdutoFilter}
            placeholder="Todos os produtos"
            searchable
            searchPlaceholder="Buscar produto..."
          />

          <MultiSelect
            label="Status"
            options={STATUS_OPTIONS}
            values={statusFilter}
            onChange={setStatusFilter}
            placeholder="Todos os status"
          />

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Origem</label>
            <div className="flex items-center gap-1">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" />
                <input
                  type="text"
                  placeholder="ex: google"
                  value={origemInput}
                  onChange={e => setOrigemInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && applyOrigem()}
                  className="w-32 rounded-lg bg-white/5 py-2 pl-8 pr-3 text-xs text-slate-200 placeholder-slate-600 outline-none ring-1 ring-white/8 focus:ring-indigo-500/50"
                />
              </div>
              <button
                onClick={applyOrigem}
                className="rounded-lg bg-indigo-500/15 px-3 py-2 text-xs font-medium text-indigo-300 transition-colors hover:bg-indigo-500/25"
              >
                OK
              </button>
              <button
                onClick={fetchVendas}
                className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-600"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                Atualizar
              </button>
            </div>
          </div>

          {hasFilters && (
            <button
              onClick={() => {
                setProdutoFilter([])
                setStatusFilter([])
                setOrigemFilter('')
                setOrigemInput('')
              }}
              className="rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex h-52 items-center justify-center">
            <Spinner size={28} />
          </div>
        ) : (
          <SalesTable
            vendas={vendas}
            exchangeRate={exchangeRate}
            initialStatusFilter="all"
          />
        )}
      </main>
    </div>
  )
}
