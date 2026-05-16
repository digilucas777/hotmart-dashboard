'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
  KeyboardSensor,
  PointerSensor,
  DragOverlay,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { supabase } from '@/lib/supabase'
import { getPeriodRange } from '@/lib/utils'
import type { Venda, Projeto, Produto, Period, WidgetConfig } from '@/lib/types'
import { PeriodFilter } from '@/components/dashboard/PeriodFilter'
import { AddWidgetModal } from '@/components/dashboard/AddWidgetModal'
import { WidgetRenderer } from '@/components/dashboard/widgets/WidgetRenderer'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

const GRID_COLUMNS = 12
const GRID_ROW_HEIGHT = 120
const GRID_GAP = 24

function widthToSpan(width?: string) {
  if (width === 'full') return 12
  if (width === '1/4') return 3
  if (width === '1/3') return 4
  if (width === '2/3') return 8
  if (width === '3/4') return 9
  return 6
}

function heightToRows(height?: string) {
  if (height === 'small') return 1
  if (height === 'large') return 3
  if (height === 'extra') return 4
  return 2
}

function withGridDefaults(widget: WidgetConfig, index: number): WidgetConfig {
  const colSpan = widget.col_span ?? widthToSpan(widget.width)
  const rowSpan = widget.row_span ?? heightToRows(widget.height)
  const perRow = Math.max(1, Math.floor(GRID_COLUMNS / colSpan))
  return {
    ...widget,
    col_start: widget.col_start ?? ((index % perRow) * colSpan) + 1,
    row_start: widget.row_start ?? Math.floor(index / perRow) * rowSpan + 1,
    col_span: colSpan,
    row_span: rowSpan,
  }
}

function collides(a: { col: number; row: number; colSpan: number; rowSpan: number }, b: WidgetConfig) {
  const bCol = b.col_start ?? 1
  const bRow = b.row_start ?? 1
  const bColSpan = b.col_span ?? widthToSpan(b.width)
  const bRowSpan = b.row_span ?? heightToRows(b.height)

  return (
    a.col < bCol + bColSpan &&
    a.col + a.colSpan > bCol &&
    a.row < bRow + bRowSpan &&
    a.row + a.rowSpan > bRow
  )
}

function nextAvailableRow(widgets: WidgetConfig[], activeId: string, col: number, row: number, colSpan: number, rowSpan: number) {
  let candidate = row
  while (
    widgets.some(w =>
      w.id !== activeId && collides({ col, row: candidate, colSpan, rowSpan }, w),
    )
  ) {
    candidate += 1
  }
  return candidate
}

export function DashboardClient({ projectId }: { projectId: string }) {
  const [projeto, setProjeto] = useState<Projeto | null>(null)
  const [vendas, setVendas] = useState<Venda[]>([])
  const [combinedVendas, setCombinedVendas] = useState<Venda[]>([])
  const [period, setPeriod] = useState<Period>('today')
  const [exchangeRate, setExchangeRate] = useState(5.85)
  const [loading, setLoading] = useState(true)
  const [custoTotal, setCustoTotal] = useState(0)

  const [widgets, setWidgets] = useState<WidgetConfig[]>([])
  const [loadingWidgets, setLoadingWidgets] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [showAddWidget, setShowAddWidget] = useState(false)
  const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

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
        setWidgets(((data ?? []) as WidgetConfig[]).map(withGridDefaults))
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
        setCombinedVendas([])
        return
      }

      const { data: prods } = await supabase
        .from('produtos')
        .select('hotmart_id')
        .in('id', produtoIds)

      const hotmartIds = (prods ?? []).map((r: { hotmart_id: string }) => r.hotmart_id)

      if (hotmartIds.length === 0) {
        setVendas([])
        setCombinedVendas([])
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

      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const thirtyDays = new Date(todayStart.getTime() - 29 * 86_400_000)
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const combinedFrom = thirtyDays < monthStart ? thirtyDays : monthStart
      const { data: combinedData } = await supabase
        .from('vendas')
        .select('*')
        .in('hotmart_produto_id', hotmartIds)
        .gte('data_venda', combinedFrom.toISOString())
        .lt('data_venda', new Date(todayStart.getTime() + 86_400_000).toISOString())
        .order('data_venda', { ascending: false })

      setCombinedVendas((combinedData ?? []) as Venda[])
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

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveWidgetId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveWidgetId(null)
      const grid = gridRef.current
      if (!grid) return
      const widget = widgets.find(w => w.id === event.active.id)
      if (!widget) return

      const rect = grid.getBoundingClientRect()
      const colWidth = (rect.width - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS
      const colStep = colWidth + GRID_GAP
      const rowStep = GRID_ROW_HEIGHT + GRID_GAP
      const colSpan = widget.col_span ?? widthToSpan(widget.width)
      const rowSpan = widget.row_span ?? heightToRows(widget.height)
      const currentCol = widget.col_start ?? 1
      const currentRow = widget.row_start ?? 1
      const nextCol = Math.min(
        GRID_COLUMNS - colSpan + 1,
        Math.max(1, Math.round(((currentCol - 1) * colStep + event.delta.x) / colStep) + 1),
      )
      const intendedRow = Math.max(
        1,
        Math.round(((currentRow - 1) * rowStep + event.delta.y) / rowStep) + 1,
      )
      const nextRow = nextAvailableRow(widgets, widget.id, nextCol, intendedRow, colSpan, rowSpan)

      setWidgets(prev => {
        return prev.map(w =>
          w.id === widget.id
            ? { ...w, col_start: nextCol, row_start: nextRow, col_span: colSpan, row_span: rowSpan }
            : w,
        )
      })

      await supabase
        .from('dashboard_widgets')
        .update({ col_start: nextCol, row_start: nextRow, col_span: colSpan, row_span: rowSpan })
        .eq('id', widget.id)
    },
    [widgets],
  )

  const addWidget = async (config: Omit<WidgetConfig, 'id' | 'projeto_id' | 'position'>) => {
    const position = widgets.length
    const col_span = widthToSpan(config.width)
    const row_span = heightToRows(config.height)
    const maxRow = widgets.reduce((max, w) => Math.max(max, (w.row_start ?? 1) + (w.row_span ?? 1) - 1), 0)
    const { data } = await supabase
      .from('dashboard_widgets')
      .insert({ ...config, projeto_id: projectId, position, col_start: 1, row_start: maxRow + 1, col_span, row_span })
      .select()
      .single()
    if (data) setWidgets(prev => [...prev, withGridDefaults(data as WidgetConfig, prev.length)])
  }

  const deleteWidget = useCallback(async (id: string) => {
    await supabase.from('dashboard_widgets').delete().eq('id', id)
    setWidgets(prev => prev.filter(w => w.id !== id))
  }, [])

  const updateWidgetConfig = useCallback(async (id: string, updates: { width?: string; height?: string; col_span?: number; row_span?: number }) => {
    await supabase.from('dashboard_widgets').update(updates).eq('id', id)
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w))
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
              className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-600"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              Atualizar
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
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveWidgetId(null)}
          >
              <div
                ref={gridRef}
                className="grid gap-6"
                style={{
                  gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
                  gridAutoRows: `${GRID_ROW_HEIGHT}px`,
                  gridAutoFlow: 'row dense',
                }}
              >
                {widgets.map(w => (
                  <WidgetRenderer
                    key={w.id}
                    config={w}
                    vendas={vendas}
                    combinedVendas={combinedVendas}
                    period={period}
                    exchangeRate={exchangeRate}
                    custoTotal={custoTotal}
                    editMode={editMode}
                    onDelete={deleteWidget}
                    onUpdateConfig={updateWidgetConfig}
                  />
                ))}
              </div>
              <DragOverlay dropAnimation={null}>
                {activeWidgetId ? (
                  <div className="max-w-56 rounded-xl border border-indigo-400/40 bg-[#191929]/75 px-4 py-3 text-sm font-semibold text-slate-200 shadow-2xl shadow-indigo-500/20 backdrop-blur">
                    {widgets.find(w => w.id === activeWidgetId)?.title}
                  </div>
                ) : null}
              </DragOverlay>
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
