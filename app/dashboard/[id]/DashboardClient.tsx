'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Settings,
  RefreshCw,
  Plus,
  LayoutDashboard,
  Pencil,
  Lock,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { supabase } from '@/lib/supabase'
import { getPeriodRange } from '@/lib/utils'
import type { Venda, Projeto, Produto, Period, WidgetConfig } from '@/lib/types'
import { PeriodFilter } from '@/components/dashboard/PeriodFilter'
import { AddWidgetModal } from '@/components/dashboard/AddWidgetModal'
import { WidgetRenderer } from '@/components/dashboard/widgets/WidgetRenderer'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

export function DashboardClient({ projectId }: { projectId: string }) {
  const [projeto, setProjeto] = useState<Projeto | null>(null)
  const [vendas, setVendas] = useState<Venda[]>([])
  const [period, setPeriod] = useState<Period>('today')
  const [exchangeRate, setExchangeRate] = useState(5.85)
  const [loading, setLoading] = useState(true)
  const [custoTotal, setCustoTotal] = useState(0)

  const [widgets, setWidgets] = useState<WidgetConfig[]>([])
  const [loadingWidgets, setLoadingWidgets] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [showAddWidget, setShowAddWidget] = useState(false)

  const [showProducts, setShowProducts] = useState(false)
  const [allProducts, setAllProducts] = useState<Produto[]>([])
  const [linkedIds, setLinkedIds] = useState<string[]>([])
  const [savingProducts, setSavingProducts] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

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

  useEffect(() => {
    supabase
      .from('dashboard_widgets')
      .select('*')
      .eq('projeto_id', projectId)
      .order('position')
      .then(({ data }) => {
        setWidgets((data ?? []) as WidgetConfig[])
        setLoadingWidgets(false)
      })
  }, [projectId])

  const fetchVendas = useCallback(async () => {
    setLoading(true)
    try {
      const { data: pp } = await supabase
        .from('projeto_produtos')
        .select('produto_id')
        .eq('projeto_id', projectId)

      const produtoIds = (pp ?? []).map((r: { produto_id: string }) => r.produto_id)

      if (produtoIds.length === 0) {
        setVendas([])
        return
      }

      const { data: prods } = await supabase
        .from('produtos')
        .select('hotmart_id')
        .in('id', produtoIds)

      const hotmartIds = (prods ?? []).map((r: { hotmart_id: string }) => r.hotmart_id)

      if (hotmartIds.length === 0) {
        setVendas([])
        return
      }

      const { from, to } = getPeriodRange(period)

      const { data } = await supabase
        .from('vendas')
        .select('*')
        .in('hotmart_produto_id', hotmartIds)
        .gte('data_venda', from.toISOString())
        .lt('data_venda', to.toISOString())
        .order('data_venda', { ascending: false })

      setVendas((data ?? []) as Venda[])
    } finally {
      setLoading(false)
    }
  }, [projectId, period])

  useEffect(() => { fetchVendas() }, [fetchVendas])

  const fetchCustos = useCallback(async () => {
    const { from, to } = getPeriodRange(period)
    const { data } = await supabase
      .from('projeto_custos')
      .select('custo_brl')
      .eq('projeto_id', projectId)
      .gte('data', from.toISOString().split('T')[0])
      .lt('data', to.toISOString().split('T')[0])
    setCustoTotal((data ?? []).reduce((sum: number, row: { custo_brl: number }) => sum + (row.custo_brl ?? 0), 0))
  }, [projectId, period])

  useEffect(() => { fetchCustos() }, [fetchCustos])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      setWidgets(prev => {
        const oldIdx = prev.findIndex(w => w.id === active.id)
        const newIdx = prev.findIndex(w => w.id === over.id)
        const reordered = arrayMove(prev, oldIdx, newIdx).map((w, i) => ({ ...w, position: i }))

        Promise.all(
          reordered.map(w =>
            supabase.from('dashboard_widgets').update({ position: w.position }).eq('id', w.id),
          ),
        ).catch(() => {})

        return reordered
      })
    },
    [],
  )

  const addWidget = async (config: Omit<WidgetConfig, 'id' | 'projeto_id' | 'position'>) => {
    const position = widgets.length
    const { data } = await supabase
      .from('dashboard_widgets')
      .insert({ ...config, projeto_id: projectId, position })
      .select()
      .single()
    if (data) setWidgets(prev => [...prev, data as WidgetConfig])
  }

  const deleteWidget = useCallback(async (id: string) => {
    await supabase.from('dashboard_widgets').delete().eq('id', id)
    setWidgets(prev => prev.filter(w => w.id !== id))
  }, [])

  const openProductsModal = async () => {
    const { data: all } = await supabase.from('produtos').select('*').order('nome')
    const { data: linked } = await supabase
      .from('projeto_produtos')
      .select('produto_id')
      .eq('projeto_id', projectId)
    setAllProducts((all ?? []) as Produto[])
    setLinkedIds((linked ?? []).map((r: { produto_id: string }) => r.produto_id))
    setShowProducts(true)
  }

  const saveProducts = async () => {
    setSavingProducts(true)
    await supabase.from('projeto_produtos').delete().eq('projeto_id', projectId)
    if (linkedIds.length > 0) {
      await supabase
        .from('projeto_produtos')
        .insert(linkedIds.map(pid => ({ projeto_id: projectId, produto_id: pid })))
    }
    setSavingProducts(false)
    setShowProducts(false)
    fetchVendas()
  }

  const isReady = !loading && !loadingWidgets

  return (
    <div className="min-h-screen" style={{ background: '#0b0b14' }}>
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
          <div className="h-4 w-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
          <h1 className="truncate text-sm font-semibold text-slate-200">
            {projeto?.nome ?? '...'}
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={fetchVendas}
              title="Atualizar"
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditMode(v => !v)}
              className={editMode ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300' : ''}
            >
              {editMode ? <Lock size={13} /> : <Pencil size={13} />}
              {editMode ? 'Travado' : 'Editar layout'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowAddWidget(true)}>
              <Plus size={13} />
              Widget
            </Button>
            <Button variant="outline" size="sm" onClick={openProductsModal}>
              <Settings size={13} />
              Produtos
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-8">
        <div className="mb-8">
          <PeriodFilter value={period} onChange={setPeriod} />
        </div>

        {!isReady ? (
          <div className="flex h-72 items-center justify-center">
            <Spinner size={32} />
          </div>
        ) : widgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
              <LayoutDashboard size={28} className="text-slate-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-400">Nenhum widget ainda</p>
              <p className="mt-1 text-xs text-slate-600">
                Clique em &quot;+ Widget&quot; para criar seu primeiro gráfico ou card.
              </p>
            </div>
            <Button onClick={() => setShowAddWidget(true)}>
              <Plus size={14} />
              Criar primeiro widget
            </Button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={widgets.map(w => w.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {widgets.map(w => (
                  <WidgetRenderer
                    key={w.id}
                    config={w}
                    vendas={vendas}
                    period={period}
                    exchangeRate={exchangeRate}
                    custoTotal={custoTotal}
                    editMode={editMode}
                    onDelete={deleteWidget}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </main>

      <AddWidgetModal
        open={showAddWidget}
        onClose={() => setShowAddWidget(false)}
        onAdd={addWidget}
      />

      <Modal
        open={showProducts}
        onClose={() => setShowProducts(false)}
        title="Configurar Produtos"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Selecione os produtos deste projeto. Somente vendas desses produtos aparecerão no dashboard.
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
                        e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id),
                      )
                    }
                    className="h-4 w-4 rounded accent-indigo-500"
                  />
                  <div>
                    <p className="text-sm text-slate-200">{p.nome}</p>
                    <p className="font-mono text-xs text-slate-600">{p.hotmart_id}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="ghost" className="flex-1" onClick={() => setShowProducts(false)}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={saveProducts} disabled={savingProducts}>
              {savingProducts && <Spinner size={14} />}
              Salvar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
