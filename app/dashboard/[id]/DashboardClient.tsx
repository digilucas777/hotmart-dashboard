'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Settings,
  RefreshCw,
  Plus,
  LayoutDashboard,
  Pencil,
  Lock,
  Save,
  Undo2,
  Redo2,
} from 'lucide-react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  DragOverlay,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
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
const GRID_ROW_HEIGHT = 20
const GRID_GAP = 0
const GRID_ITEM_PADDING = 10
const LAYOUT_STORAGE_PREFIX = 'dashboard-layout:'

type GridPlacement = {
  id: string
  col_start: number
  row_start: number
  col_span: number
  row_span: number
}

function widthToSpan(width?: string) {
  if (width === 'full') return 12
  if (width === '1/4') return 3
  if (width === '1/3') return 4
  if (width === '2/3') return 8
  if (width === '3/4') return 9
  return 6
}

function heightToRows(height?: string, type?: string) {
  if (height === 'small') return 6
  if (height === 'large') return 18
  if (height === 'extra') return 24
  if (type === 'metric') return 7
  if (type === 'combined' || type === 'table') return 22
  if (type === 'line' || type === 'bar' || type === 'pie') return 18
  return 12
}

function normalizeRowSpan(widget: WidgetConfig) {
  const rowSpan = widget.row_span ?? heightToRows(widget.height, widget.type)
  return rowSpan <= 4 ? heightToRows(widget.height, widget.type) : rowSpan
}

function normalizeColSpan(span: number) {
  if (span <= 2) return 2
  if (span <= 3) return 3
  if (span <= 4) return 4
  if (span <= 6) return 6
  if (span <= 8) return 8
  if (span <= 9) return 9
  return 12
}

function withGridDefaults(widget: WidgetConfig, index: number): WidgetConfig {
  const colSpan = widget.col_span ?? widthToSpan(widget.width)
  const rowSpan = normalizeRowSpan(widget)
  const perRow = Math.max(1, Math.floor(GRID_COLUMNS / colSpan))
  return {
    ...widget,
    col_start: widget.col_start ?? ((index % perRow) * colSpan) + 1,
    row_start: widget.row_start ?? Math.floor(index / perRow) * rowSpan + 1,
    col_span: colSpan,
    row_span: rowSpan,
  }
}

function normalizeLoadedLayout(rawWidgets: WidgetConfig[]) {
  const normalized = rawWidgets.map(withGridDefaults)
  const needsRecovery = rawWidgets.some(w => (w.row_span ?? 0) <= 4 || (w.row_start ?? 1) > 80)
  return needsRecovery ? compactLayout(normalized) : normalized
}

function collides(a: { col: number; row: number; colSpan: number; rowSpan: number }, b: WidgetConfig) {
  const bCol = b.col_start ?? 1
  const bRow = b.row_start ?? 1
  const bColSpan = b.col_span ?? widthToSpan(b.width)
  const bRowSpan = normalizeRowSpan(b)

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

function maxLayoutRow(widgets: WidgetConfig[], activeId?: string) {
  return widgets
    .filter(w => w.id !== activeId)
    .reduce((max, w) => Math.max(max, (w.row_start ?? 1) + normalizeRowSpan(w)), 1)
}

function applyPlacement(widget: WidgetConfig, placement: GridPlacement): WidgetConfig {
  return widget.id === placement.id
    ? {
        ...widget,
        col_start: placement.col_start,
        row_start: placement.row_start,
        col_span: placement.col_span,
        row_span: placement.row_span,
      }
    : widget
}

function layoutBounds(layout: WidgetConfig[], ignoreId?: string) {
  return layout
    .filter(w => w.id !== ignoreId)
    .map(w => ({
      id: w.id,
      col: w.col_start ?? 1,
      row: w.row_start ?? 1,
      colSpan: w.col_span ?? widthToSpan(w.width),
      rowSpan: normalizeRowSpan(w),
    }))
}

function collidesBounds(
  a: { col: number; row: number; colSpan: number; rowSpan: number },
  b: { col: number; row: number; colSpan: number; rowSpan: number },
) {
  return (
    a.col < b.col + b.colSpan &&
    a.col + a.colSpan > b.col &&
    a.row < b.row + b.rowSpan &&
    a.row + a.rowSpan > b.row
  )
}

function resolveOverlaps(layout: WidgetConfig[], activeId: string) {
  const active = layout.find(w => w.id === activeId)
  if (!active) return layout

  const placed = layoutBounds([active])
  const next = layout.map(w => ({ ...w }))
  const others = next
    .filter(w => w.id !== activeId)
    .sort((a, b) => ((a.row_start ?? 1) - (b.row_start ?? 1)) || ((a.col_start ?? 1) - (b.col_start ?? 1)))

  for (const widget of others) {
    const colSpan = widget.col_span ?? widthToSpan(widget.width)
    const rowSpan = normalizeRowSpan(widget)
    const box = {
      col: widget.col_start ?? 1,
      row: widget.row_start ?? 1,
      colSpan,
      rowSpan,
    }

    while (placed.some(p => collidesBounds(box, p))) {
      box.row += 1
    }

    widget.row_start = box.row
    widget.row_span = rowSpan
    placed.push({ id: widget.id, ...box })
  }

  return next
}

function compactLayout(widgets: WidgetConfig[]) {
  const placed: { col: number; row: number; colSpan: number; rowSpan: number }[] = []

  return widgets.map((widget, index) => {
    const colSpan = widget.col_span ?? widthToSpan(widget.width)
    const rowSpan = normalizeRowSpan(widget)
    let row = 1
    let col = 1

    search:
    while (true) {
      for (col = 1; col <= GRID_COLUMNS - colSpan + 1; col++) {
        const box = { col, row, colSpan, rowSpan }
        if (!placed.some(p => collidesBounds(box, p))) break search
      }
      row += 1
    }

    placed.push({ col, row, colSpan, rowSpan })
    return {
      ...widget,
      position: index,
      col_start: col,
      row_start: row,
      col_span: colSpan,
      row_span: rowSpan,
    }
  })
}

function sameLayout(a: WidgetConfig[], b: WidgetConfig[]) {
  if (a.length !== b.length) return false
  return a.every((widget, index) => {
    const other = b[index]
    return (
      other &&
      widget.id === other.id &&
      widget.col_start === other.col_start &&
      widget.row_start === other.row_start &&
      widget.col_span === other.col_span &&
      widget.row_span === other.row_span
    )
  })
}

function mergeStoredLayout(widgets: WidgetConfig[], projectId: string) {
  if (typeof window === 'undefined') return widgets
  try {
    const stored = JSON.parse(window.localStorage.getItem(`${LAYOUT_STORAGE_PREFIX}${projectId}`) ?? '[]') as GridPlacement[]
    if (!Array.isArray(stored) || stored.length === 0) return widgets
    return widgets.map(widget => {
      const placement = stored.find(item => item.id === widget.id)
      return placement ? applyPlacement(widget, placement) : widget
    })
  } catch {
    return widgets
  }
}

function persistLocalLayout(projectId: string, widgets: WidgetConfig[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    `${LAYOUT_STORAGE_PREFIX}${projectId}`,
    JSON.stringify(widgets.map(w => ({
      id: w.id,
      col_start: w.col_start ?? 1,
      row_start: w.row_start ?? 1,
      col_span: w.col_span ?? widthToSpan(w.width),
      row_span: normalizeRowSpan(w),
    }))),
  )
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
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null)
  const [dragPreview, setDragPreview] = useState<GridPlacement | null>(null)
  const [resizePreview, setResizePreview] = useState<GridPlacement | null>(null)
  const [savedWidgets, setSavedWidgets] = useState<WidgetConfig[]>([])
  const [undoStack, setUndoStack] = useState<WidgetConfig[][]>([])
  const [redoStack, setRedoStack] = useState<WidgetConfig[][]>([])
  const [savingLayout, setSavingLayout] = useState(false)
  const [layoutError, setLayoutError] = useState<string | null>(null)
  const [widgetError, setWidgetError] = useState<string | null>(null)
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
        const normalized = mergeStoredLayout(normalizeLoadedLayout((data ?? []) as WidgetConfig[]), projectId)
        setWidgets(normalized)
        setSavedWidgets(normalized)
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

  const pushHistory = useCallback(() => {
    setUndoStack(prev => [...prev, widgets])
    setRedoStack([])
  }, [widgets])

  const getPlacementFromDelta = useCallback(
    (id: string, delta: { x: number; y: number }): GridPlacement | null => {
      const grid = gridRef.current
      if (!grid) return null
      const widget = widgets.find(w => w.id === id)
      if (!widget) return null

      const rect = grid.getBoundingClientRect()
      const colWidth = (rect.width - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS
      const colStep = colWidth + GRID_GAP
      const rowStep = GRID_ROW_HEIGHT + GRID_GAP
      const colSpan = widget.col_span ?? widthToSpan(widget.width)
      const rowSpan = normalizeRowSpan(widget)
      const currentCol = widget.col_start ?? 1
      const currentRow = widget.row_start ?? 1
      const col_start = Math.min(
        GRID_COLUMNS - colSpan + 1,
        Math.max(1, Math.round(((currentCol - 1) * colStep + delta.x) / colStep) + 1),
      )
      const intendedRow = Math.max(
        1,
        Math.round(((currentRow - 1) * rowStep + delta.y) / rowStep) + 1,
      )
      const row_start = Math.min(intendedRow, maxLayoutRow(widgets, widget.id))

      return { id, col_start, row_start, col_span: colSpan, row_span: rowSpan }
    },
    [widgets],
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = String(event.active.id)
    setActiveWidgetId(id)
    setSelectedWidgetId(id)
  }, [])

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      setDragPreview(getPlacementFromDelta(String(event.active.id), event.delta))
    },
    [getPlacementFromDelta],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveWidgetId(null)
      const placement = dragPreview ?? getPlacementFromDelta(String(event.active.id), event.delta)
      setDragPreview(null)
      if (!placement) return
      pushHistory()
      setWidgets(prev => resolveOverlaps(prev.map(w => applyPlacement(w, placement)), placement.id))
    },
    [dragPreview, getPlacementFromDelta, pushHistory],
  )

  const addWidget = async (config: Omit<WidgetConfig, 'id' | 'projeto_id' | 'position'>) => {
    const position = widgets.length
    const col_span = widthToSpan(config.width)
    const row_span = heightToRows(config.height, config.type)
    const maxRow = widgets.reduce((max, w) => Math.max(max, (w.row_start ?? 1) + (w.row_span ?? 1) - 1), 0)
    const payload = { ...config, projeto_id: projectId, position, col_start: 1, row_start: maxRow + 1, col_span, row_span }
    const legacyPayload = { ...config, projeto_id: projectId, position }

    setWidgetError(null)
    let { data, error } = await supabase
      .from('dashboard_widgets')
      .insert(payload)
      .select()
      .single()

    if (error && error.message.includes('schema cache')) {
      const retry = await supabase
        .from('dashboard_widgets')
        .insert(legacyPayload)
        .select()
        .single()
      data = retry.data
      error = retry.error
      if (!error) {
        setWidgetError('Widget criado. Aplique a migration 011 para salvar posição e tamanho do grid.')
      }
    }

    if (error) {
      setWidgetError(error.message)
      return
    }
    if (data) {
      setWidgets(prev => {
        const next = compactLayout([...prev, withGridDefaults(data as WidgetConfig, prev.length)])
        setSavedWidgets(next)
        return next
      })
    }
  }

  const deleteWidget = useCallback(async (id: string) => {
    await supabase.from('dashboard_widgets').delete().eq('id', id)
    setWidgets(prev => prev.filter(w => w.id !== id))
    setSavedWidgets(prev => prev.filter(w => w.id !== id))
    setSelectedWidgetId(prev => prev === id ? null : prev)
  }, [])

  const updateWidgetConfig = useCallback((id: string, updates: { width?: string; height?: string; col_span?: number; row_span?: number }) => {
    pushHistory()
    setWidgets(prev => resolveOverlaps(prev.map(w => w.id === id ? { ...w, ...updates } : w), id))
  }, [pushHistory])

  const getResizePlacement = useCallback((id: string, width: number, height: number): GridPlacement | null => {
    const grid = gridRef.current
    const widget = widgets.find(w => w.id === id)
    if (!grid || !widget) return null

    const rect = grid.getBoundingClientRect()
    const colWidth = rect.width / GRID_COLUMNS
    const col_span = Math.min(
      GRID_COLUMNS - (widget.col_start ?? 1) + 1,
      normalizeColSpan(Math.round((width + GRID_ITEM_PADDING * 2) / colWidth)),
    )
    const row_span = Math.max(7, Math.round((height + GRID_ITEM_PADDING * 2) / GRID_ROW_HEIGHT))
    return {
      id,
      col_start: widget.col_start ?? 1,
      row_start: widget.row_start ?? 1,
      col_span,
      row_span,
    }
  }, [widgets])

  const previewWidgetResize = useCallback((id: string, width: number, height: number) => {
    setResizePreview(getResizePlacement(id, width, height))
  }, [getResizePlacement])

  const commitWidgetResize = useCallback((id: string, width: number, height: number) => {
    const placement = getResizePlacement(id, width, height)
    setResizePreview(null)
    if (!placement) return
    pushHistory()
    setWidgets(prev => resolveOverlaps(prev.map(w => applyPlacement(w, placement)), id))
  }, [getResizePlacement, pushHistory])

  const organizeLayout = useCallback(() => {
    pushHistory()
    setWidgets(prev => compactLayout(prev))
  }, [pushHistory])

  const saveLayout = useCallback(async () => {
    setSavingLayout(true)
    setLayoutError(null)
    try {
      const results = await Promise.all(
        widgets.map((w, index) =>
          supabase
            .from('dashboard_widgets')
            .update({
              position: index,
              col_start: w.col_start ?? 1,
              row_start: w.row_start ?? 1,
              col_span: w.col_span ?? widthToSpan(w.width),
              row_span: w.row_span ?? normalizeRowSpan(w),
            })
            .eq('id', w.id),
        ),
      )
      const failed = results.find(result => result.error)
      if (failed?.error) throw failed.error
      setSavedWidgets(widgets)
      persistLocalLayout(projectId, widgets)
      setUndoStack([])
      setRedoStack([])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível salvar o layout.'
      if (message.includes('schema cache') || message.includes('col_span')) {
        persistLocalLayout(projectId, widgets)
        setSavedWidgets(widgets)
        setUndoStack([])
        setRedoStack([])
        setLayoutError(null)
      } else {
        setLayoutError(message)
      }
    } finally {
      setSavingLayout(false)
    }
  }, [widgets])

  const undoLayout = useCallback(() => {
    setUndoStack(prev => {
      const previous = prev.at(-1)
      if (!previous) return prev
      setRedoStack(stack => [...stack, widgets])
      setWidgets(previous)
      return prev.slice(0, -1)
    })
  }, [widgets])

  const redoLayout = useCallback(() => {
    setRedoStack(prev => {
      const next = prev.at(-1)
      if (!next) return prev
      setUndoStack(stack => [...stack, widgets])
      setWidgets(next)
      return prev.slice(0, -1)
    })
  }, [widgets])

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
  const hasUnsavedLayout = !sameLayout(widgets, savedWidgets)
  const previewPlacement = dragPreview ?? resizePreview
  const displayedWidgets = useMemo(
    () => previewPlacement
      ? (dragPreview
          ? resolveOverlaps(widgets.map(w => applyPlacement(w, previewPlacement)), previewPlacement.id)
          : resolveOverlaps(widgets.map(w => applyPlacement(w, previewPlacement)), previewPlacement.id))
      : widgets,
    [dragPreview, previewPlacement, widgets],
  )

  return (
    <div className="min-h-screen bg-[#090912] text-slate-100">
      <header
        className="sticky top-0 z-40 border-b shadow-2xl shadow-black/20"
        style={{
          borderColor: 'rgba(255,255,255,0.07)',
          background: 'rgba(9,9,18,0.88)',
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
          <div className="ml-auto" />
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-9">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <PeriodFilter value={period} onChange={setPeriod} />
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-[#111120]/75 p-1.5 shadow-xl shadow-black/20">
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
              onClick={() => {
                setEditMode(v => !v)
                setSelectedWidgetId(null)
              }}
              className={editMode ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300' : ''}
            >
              {editMode ? <Lock size={13} /> : <Pencil size={13} />}
              {editMode ? 'Travado' : 'Editar layout'}
            </Button>
            {editMode && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={organizeLayout}
                  title="Organizar widgets em sequência"
                >
                  <LayoutDashboard size={13} />
                  Organizar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={undoLayout}
                  disabled={undoStack.length === 0}
                  title="Desfazer última edição"
                >
                  <Undo2 size={13} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={redoLayout}
                  disabled={redoStack.length === 0}
                  title="Refazer edição"
                >
                  <Redo2 size={13} />
                </Button>
                <Button
                  size="sm"
                  onClick={saveLayout}
                  disabled={!hasUnsavedLayout || savingLayout}
                >
                  {savingLayout ? <Spinner size={13} /> : <Save size={13} />}
                  Salvar
                </Button>
              </>
            )}
            {editMode && (
              <Button variant="outline" size="sm" onClick={() => setShowAddWidget(true)}>
                <Plus size={13} />
                Widget
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={openProductsModal}>
              <Settings size={13} />
              Produtos
            </Button>
          </div>
        </div>
        {editMode && (
          <div className="mb-5 flex items-center justify-between rounded-xl border border-white/10 bg-[#151525]/80 px-4 py-3 text-xs text-slate-400 shadow-xl shadow-black/20">
            <span>
              {selectedWidgetId
                ? 'Widget selecionado. Arraste o card ou use o canto inferior direito para redimensionar.'
                : 'Selecione um widget para editar posição e tamanho.'}
            </span>
            <span className={layoutError ? 'font-semibold text-red-300' : hasUnsavedLayout ? 'font-semibold text-indigo-300' : 'text-slate-600'}>
              {layoutError ?? (hasUnsavedLayout ? 'Alterações não salvas' : 'Layout salvo')}
            </span>
          </div>
        )}
        {widgetError && (
          <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-200">
            Erro ao criar widget: {widgetError}
          </div>
        )}

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
            <Button onClick={() => {
              setEditMode(true)
              setShowAddWidget(true)
            }}>
              <Plus size={14} />
              Criar primeiro widget
            </Button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={() => {
              setActiveWidgetId(null)
              setDragPreview(null)
            }}
          >
              <div
                ref={gridRef}
                className="relative grid"
                style={{
                  gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
                  gridAutoRows: `${GRID_ROW_HEIGHT}px`,
                  gridAutoFlow: 'row dense',
                  gap: `${GRID_GAP}px`,
                }}
              >
                {previewPlacement && (
                  <div
                    className="pointer-events-none m-2.5 rounded-2xl border border-dashed border-white/70 bg-white/8 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_18px_45px_rgba(99,102,241,0.18)]"
                    style={{
                      gridColumn: `${previewPlacement.col_start} / span ${previewPlacement.col_span}`,
                      gridRow: `${previewPlacement.row_start} / span ${previewPlacement.row_span}`,
                    }}
                  />
                )}
                {displayedWidgets.map(w => (
                  <WidgetRenderer
                    key={w.id}
                    config={w}
                    vendas={vendas}
                    combinedVendas={combinedVendas}
                    period={period}
                    exchangeRate={exchangeRate}
                    custoTotal={custoTotal}
                    editMode={editMode}
                    selected={selectedWidgetId === w.id}
                    onSelect={setSelectedWidgetId}
                    onDelete={deleteWidget}
                    onUpdateConfig={updateWidgetConfig}
                    onPreviewResize={previewWidgetResize}
                    onCommitResize={commitWidgetResize}
                  />
                ))}
              </div>
              <DragOverlay dropAnimation={null}>
                {activeWidgetId ? (
                  <div className="rounded-2xl border border-white/35 bg-[#1d1d31]/80 px-5 py-4 text-sm font-semibold text-slate-100 shadow-2xl shadow-indigo-500/25 backdrop-blur">
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
