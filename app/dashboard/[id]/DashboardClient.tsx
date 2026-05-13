'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  TrendingUp,
  CheckCircle,
  RotateCcw,
  Clock,
  AlertTriangle,
  DollarSign,
  CreditCard,
  Settings,
  RefreshCw,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  getPeriodRange,
  buildChartData,
  buildPieData,
  formatBRL,
  formatUSD,
} from '@/lib/utils'
import type { Venda, Projeto, Produto, Period } from '@/lib/types'
import { PeriodFilter } from '@/components/dashboard/PeriodFilter'
import {
  DraggableMetrics,
  type MetricConfig,
} from '@/components/dashboard/DraggableMetrics'
import { SalesLineChart } from '@/components/dashboard/SalesLineChart'
import { PaymentPieChart } from '@/components/dashboard/PaymentPieChart'
import { SalesTable } from '@/components/dashboard/SalesTable'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

export function DashboardClient({ projectId }: { projectId: string }) {
  const [projeto, setProjeto] = useState<Projeto | null>(null)
  const [vendas, setVendas] = useState<Venda[]>([])
  const [period, setPeriod] = useState<Period>('30d')
  const [exchangeRate, setExchangeRate] = useState(5.85)
  const [loading, setLoading] = useState(true)

  const [showProducts, setShowProducts] = useState(false)
  const [allProducts, setAllProducts] = useState<Produto[]>([])
  const [linkedIds, setLinkedIds] = useState<string[]>([])
  const [savingProducts, setSavingProducts] = useState(false)

  useEffect(() => {
    fetch('/api/exchange-rate')
      .then(r => r.json())
      .then((d: { rate: number }) => setExchangeRate(d.rate ?? 5.85))
      .catch(() => {})
  }, [])

  useEffect(() => {
    supabase
      .from('projetos')
      .select('*')
      .eq('id', projectId)
      .single()
      .then(({ data }) => { if (data) setProjeto(data as Projeto) })
  }, [projectId])

  const fetchVendas = useCallback(async () => {
    setLoading(true)
    try {
      const { data: pp } = await supabase
        .from('projeto_produtos')
        .select('produto_id')
        .eq('projeto_id', projectId)

      const produtoIds = (pp ?? []).map(
        (r: { produto_id: string }) => r.produto_id,
      )

      if (produtoIds.length === 0) {
        setVendas([])
        return
      }

      const { data: prods } = await supabase
        .from('produtos')
        .select('nome')
        .in('id', produtoIds)

      const nomes = (prods ?? []).map((r: { nome: string }) => r.nome)

      if (nomes.length === 0) {
        setVendas([])
        return
      }

      const { from, to } = getPeriodRange(period)

      const { data } = await supabase
        .from('vendas')
        .select('*')
        .in('produto', nomes)
        .gte('data_venda', from.toISOString())
        .lt('data_venda', to.toISOString())
        .order('data_venda', { ascending: false })

      setVendas((data ?? []) as Venda[])
    } finally {
      setLoading(false)
    }
  }, [projectId, period])

  useEffect(() => { fetchVendas() }, [fetchVendas])

  // Metrics computation
  const approved = vendas.filter(v => v.status === 'approved')
  const refunded = vendas.filter(v => v.status === 'refunded')
  const pending = vendas.filter(v => v.status === 'pending')
  const chargeback = vendas.filter(v => v.status === 'cancelled')
  const totalRevenue = approved.reduce((s, v) => s + (v.valor ?? 0), 0)
  const avgTicket = approved.length > 0 ? totalRevenue / approved.length : 0
  const approvalRate =
    vendas.length > 0 ? (approved.length / vendas.length) * 100 : 0

  const sum = (arr: Venda[]) =>
    arr.reduce((s, v) => s + (v.valor ?? 0), 0)

  const metrics: MetricConfig[] = [
    {
      id: 'revenue',
      icon: DollarSign,
      label: 'Faturamento Total',
      value: formatBRL(totalRevenue),
      subValue: `${formatUSD(totalRevenue / exchangeRate)} · R$ ${exchangeRate.toFixed(2)}/USD`,
      color: 'indigo',
    },
    {
      id: 'approved',
      icon: CheckCircle,
      label: 'Aprovadas',
      value: String(approved.length),
      subValue: `${approvalRate.toFixed(1)}% de aprovação`,
      color: 'green',
    },
    {
      id: 'refunded',
      icon: RotateCcw,
      label: 'Reembolsos',
      value: String(refunded.length),
      subValue: refunded.length > 0 ? formatBRL(sum(refunded)) : '—',
      color: 'red',
    },
    {
      id: 'pending',
      icon: Clock,
      label: 'Pendentes',
      value: String(pending.length),
      subValue: pending.length > 0 ? formatBRL(sum(pending)) : '—',
      color: 'yellow',
    },
    {
      id: 'chargeback',
      icon: AlertTriangle,
      label: 'Chargeback',
      value: String(chargeback.length),
      subValue: chargeback.length > 0 ? formatBRL(sum(chargeback)) : '—',
      color: 'orange',
    },
    {
      id: 'approval_rate',
      icon: TrendingUp,
      label: 'Taxa de Aprovação',
      value: `${approvalRate.toFixed(1)}%`,
      subValue: `${approved.length} de ${vendas.length} vendas`,
      color: 'blue',
    },
    {
      id: 'ticket',
      icon: CreditCard,
      label: 'Ticket Médio',
      value: formatBRL(avgTicket),
      subValue:
        approved.length > 0
          ? `${approved.length} vendas aprovadas`
          : 'Sem vendas aprovadas',
      color: 'purple',
    },
  ]

  const chartData = buildChartData(vendas, period)
  const pieData = buildPieData(vendas)

  // Products modal
  const openProductsModal = async () => {
    const { data: all } = await supabase
      .from('produtos')
      .select('*')
      .order('nome')
    const { data: linked } = await supabase
      .from('projeto_produtos')
      .select('produto_id')
      .eq('projeto_id', projectId)
    setAllProducts((all ?? []) as Produto[])
    setLinkedIds(
      (linked ?? []).map((r: { produto_id: string }) => r.produto_id),
    )
    setShowProducts(true)
  }

  const saveProducts = async () => {
    setSavingProducts(true)
    await supabase
      .from('projeto_produtos')
      .delete()
      .eq('projeto_id', projectId)
    if (linkedIds.length > 0) {
      await supabase
        .from('projeto_produtos')
        .insert(
          linkedIds.map(pid => ({ projeto_id: projectId, produto_id: pid })),
        )
    }
    setSavingProducts(false)
    setShowProducts(false)
    fetchVendas()
  }

  return (
    <div className="min-h-screen" style={{ background: '#0b0b14' }}>
      {/* Sticky header */}
      <header
        className="sticky top-0 z-40 border-b"
        style={{
          borderColor: 'rgba(255,255,255,0.07)',
          background: 'rgba(11,11,20,0.85)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-6">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-200"
          >
            <ArrowLeft size={15} />
            Projetos
          </Link>
          <div
            className="h-4 w-px"
            style={{ background: 'rgba(255,255,255,0.1)' }}
          />
          <h1 className="truncate text-sm font-semibold text-slate-200">
            {projeto?.nome ?? '...'}
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={fetchVendas}
              title="Atualizar"
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
            >
              <RefreshCw
                size={15}
                className={loading ? 'animate-spin' : ''}
              />
            </button>
            <Button variant="outline" size="sm" onClick={openProductsModal}>
              <Settings size={13} />
              Produtos
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-8">
        {/* Period filter */}
        <div className="mb-8">
          <PeriodFilter value={period} onChange={setPeriod} />
        </div>

        {loading ? (
          <div className="flex h-72 items-center justify-center">
            <Spinner size={32} />
          </div>
        ) : (
          <>
            {vendas.length === 0 && (
              <div
                className="mb-6 rounded-2xl border border-dashed px-6 py-5 text-center text-sm text-slate-600"
                style={{ borderColor: 'rgba(255,255,255,0.1)' }}
              >
                Nenhuma venda encontrada no período. Configure os produtos
                clicando em{' '}
                <button
                  onClick={openProductsModal}
                  className="text-indigo-400 underline underline-offset-2 hover:text-indigo-300"
                >
                  Produtos
                </button>
                .
              </div>
            )}

            {/* Metrics grid */}
            <div className="mb-8">
              <DraggableMetrics metrics={metrics} />
            </div>

            {/* Charts */}
            <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <SalesLineChart data={chartData} />
              </div>
              <PaymentPieChart data={pieData} />
            </div>

            {/* Sales table */}
            <SalesTable vendas={vendas} exchangeRate={exchangeRate} />
          </>
        )}
      </main>

      {/* Products modal */}
      <Modal
        open={showProducts}
        onClose={() => setShowProducts(false)}
        title="Configurar Produtos"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Selecione os produtos deste projeto. Somente vendas desses produtos
            aparecerão no dashboard.
          </p>
          {allProducts.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-600">
              Nenhum produto cadastrado. Aguarde os webhooks da Hotmart.
            </p>
          ) : (
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {allProducts.map(p => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/5"
                >
                  <input
                    type="checkbox"
                    checked={linkedIds.includes(p.id)}
                    onChange={e =>
                      setLinkedIds(prev =>
                        e.target.checked
                          ? [...prev, p.id]
                          : prev.filter(id => id !== p.id),
                      )
                    }
                    className="h-4 w-4 rounded accent-indigo-500"
                  />
                  <div>
                    <p className="text-sm text-slate-200">{p.nome}</p>
                    <p className="font-mono text-xs text-slate-600">
                      {p.hotmart_id}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => setShowProducts(false)}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={saveProducts}
              disabled={savingProducts}
            >
              {savingProducts && <Spinner size={14} />}
              Salvar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
