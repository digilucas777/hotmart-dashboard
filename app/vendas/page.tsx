'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
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
  { value: 'chargeback', label: 'Chargeback' },
  { value: 'disputed', label: 'Reclamado' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'abandoned', label: 'Abandono' },
]

export default function VendasPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  // Vendas de todo projeto que o usuário tem acesso ao dashboard (pode_visualizar) — mesmo
  // critério usado em /projects e já aplicado pelo RLS de `vendas`. Só usado pra não-admin;
  // admin não tem restrição (null).
  const [allowedHotmartIds, setAllowedHotmartIds] = useState<string[]>([])
  const [vendas, setVendas] = useState<Venda[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const [exchangeRate, setExchangeRate] = useState(5.0)

  const [period, setPeriod] = useState<Period>('thisMonth')
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

  useEffect(() => {
    async function checkAccess() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (profile?.role === 'admin') { setIsAdmin(true); setAllowed(true); return }

      // Acesso à aba = acesso ao dashboard do projeto (pode_visualizar) E o checkbox
      // "Ver aba Vendas" marcado nesse mesmo projeto (pode_ver_vendas) — as duas coisas
      // precisam estar marcadas pra aquele projeto específico aparecer aqui. Resolve também
      // a lista de produtos desses projetos, pra escopar a busca de vendas explicitamente
      // (em vez de confiar só no RLS).
      const { data: perms } = await supabase
        .from('user_dashboard_permissions')
        .select('projeto_id')
        .eq('user_id', user.id)
        .eq('pode_visualizar', true)
        .eq('pode_ver_vendas', true)
      const projetoIds = (perms ?? []).map((r: { projeto_id: string }) => r.projeto_id)
      if (projetoIds.length === 0) { router.push('/projects'); return }

      const { data: pp } = await supabase
        .from('projeto_produtos')
        .select('produto_id')
        .in('projeto_id', projetoIds)
      const produtoIds = Array.from(new Set((pp ?? []).map((r: { produto_id: string }) => r.produto_id)))

      if (produtoIds.length > 0) {
        const { data: prods } = await supabase
          .from('produtos')
          .select('hotmart_id')
          .in('id', produtoIds)
        setAllowedHotmartIds((prods ?? []).map((r: { hotmart_id: string }) => r.hotmart_id))
      }
      setAllowed(true)
    }
    void checkAccess()
  }, [router])

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
    const toLocalDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const { from, to } = getPeriodRange(period, customDateRange)
    const fromStr = toLocalDate(from)
    const toStr = toLocalDate(new Date(to.getTime() - 1))
    fetch(`/api/exchange-rate?from=${fromStr}&to=${toStr}`)
      .then(r => r.json())
      .then((d: { rate: number }) => setExchangeRate(d.rate ?? 5.0))
      .catch(() => {})
  }, [period, customDateRange])

  useEffect(() => {
    if (allowed !== true) return
    // Não-admin só vê no filtro os produtos dos projetos que tem acesso — senão o dropdown
    // "Produto" expõe nomes de produtos de outros donos/gestores sem nenhuma venda visível.
    // Um array vazio em .in() já devolve zero linhas, então não precisa de um caso especial.
    let query = supabase.from('produtos').select('*').order('nome')
    if (!isAdmin) query = query.in('hotmart_id', allowedHotmartIds)
    query.then(({ data }) => setProdutos((data ?? []) as Produto[]))
  }, [allowed, isAdmin, allowedHotmartIds])

  const fetchVendas = useCallback(async () => {
    setLoading(true)
    try {
      const { from, to } = getPeriodRange(period, customDateRange)

      // Escopo explícito por projeto acessível (não-admin) — em vez de confiar só no RLS,
      // igual ao padrão já usado em DashboardClient.tsx. Combina com o filtro de produto
      // escolhido no próprio filtro (interseção: precisa satisfazer os dois).
      let scopedHotmartIds: string[] | null = isAdmin ? null : allowedHotmartIds
      if (produtoFilter.length > 0) {
        const selected = produtos.filter(p => produtoFilter.includes(p.id)).map(p => p.hotmart_id)
        scopedHotmartIds = scopedHotmartIds ? scopedHotmartIds.filter(id => selected.includes(id)) : selected
      }

      if (scopedHotmartIds !== null && scopedHotmartIds.length === 0) {
        setVendas([])
        setLastUpdatedAt(new Date())
        return
      }

      let query = supabase
        .from('vendas')
        .select('*')
        .order('data_venda', { ascending: false })
        .gte('data_venda', from.toISOString())
        .lt('data_venda', to.toISOString())

      if (scopedHotmartIds !== null) query = query.in('hotmart_produto_id', scopedHotmartIds)
      if (statusFilter.length > 0) query = query.in('status', statusFilter)
      if (origemFilter) query = query.ilike('origem', `%${origemFilter}%`)

      const { data, error } = await query
      if (error) throw error
      setVendas((data ?? []) as Venda[])
      setLastUpdatedAt(new Date())
    } catch (err) {
      console.error('[VendasPage] falha ao carregar vendas:', err)
    } finally {
      setLoading(false)
    }
  }, [period, customDateRange, produtoFilter, statusFilter, origemFilter, produtos, isAdmin, allowedHotmartIds])

  useEffect(() => {
    fetchVendas()
  }, [fetchVendas])

  function applyOrigem() {
    setOrigemFilter(origemInput)
  }

  const hasFilters = produtoFilter.length > 0 || statusFilter.length > 0 || origemFilter

  if (allowed !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size={28} />
      </div>
    )
  }

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
            updatedAt={lastUpdatedAt}
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
