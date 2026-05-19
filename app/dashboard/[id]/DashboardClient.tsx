'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Settings,
  RefreshCw,
  Plus,
  LayoutDashboard,
  Pencil,
  Rocket,
  Save,
  Search,
  Undo2,
  Redo2,
  X,
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
import { formatRelativeTime, getPeriodRange, getPreviousPeriodRange } from '@/lib/utils'
import type { Venda, Projeto, Produto, Period, WidgetConfig, WidgetType, WidgetDataSource } from '@/lib/types'
import { PeriodFilter } from '@/components/dashboard/PeriodFilter'
import { AddWidgetModal } from '@/components/dashboard/AddWidgetModal'
import { EditWidgetModal } from '@/components/dashboard/EditWidgetModal'
import { WidgetRenderer } from '@/components/dashboard/widgets/WidgetRenderer'
import type { ResizeDirection } from '@/components/dashboard/widgets/WidgetRenderer'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

const GRID_COLUMNS = 12
const GRID_ROW_HEIGHT = 20
const GRID_GAP = 0
const GRID_ITEM_PADDING = 10
const LAYOUT_STORAGE_PREFIX = 'dashboard-layout:'
const THEME_STORAGE_KEY = 'dashboard-theme'

function getMetricSnapRows(): [number, number, number] {
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900
  return [
    Math.max(5, Math.round(vh * 0.05 / GRID_ROW_HEIGHT)),
    Math.max(7, Math.round(vh * 0.07 / GRID_ROW_HEIGHT)),
    Math.max(9, Math.round(vh * 0.09 / GRID_ROW_HEIGHT)),
  ] as [number, number, number]
}

function snapToMetricRows(rowSpan: number): number {
  const snaps = getMetricSnapRows()
  return snaps.reduce((best, snap) =>
    Math.abs(snap - rowSpan) < Math.abs(best - rowSpan) ? snap : best,
  )
}

type DashboardTheme = 'dark' | 'light'

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
  if (type === 'metric') return getMetricSnapRows()[1]
  if (type === 'combined' || type === 'table') return 22
  if (type === 'line' || type === 'bar' || type === 'pie') return 18
  return 12
}

function normalizeRowSpan(widget: WidgetConfig) {
  const rowSpan = widget.row_span ?? heightToRows(widget.height, widget.type)
  const raw = rowSpan <= 4 ? heightToRows(widget.height, widget.type) : rowSpan
  if (widget.type === 'metric') return snapToMetricRows(raw)
  return raw
}

function normalizeColSpan(span: number) {
  return Math.min(GRID_COLUMNS, Math.max(2, Math.round(span)))
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

// Treats all widgets in activeIds as fixed; pushes non-active widgets down on overlap.
function resolveOverlapsMulti(layout: WidgetConfig[], activeIds: Set<string>) {
  const fixed = layoutBounds(layout.filter(w => activeIds.has(w.id)))
  const next = layout.map(w => ({ ...w }))
  const others = next
    .filter(w => !activeIds.has(w.id))
    .sort((a, b) => ((a.row_start ?? 1) - (b.row_start ?? 1)) || ((a.col_start ?? 1) - (b.col_start ?? 1)))

  const placed = [...fixed]
  for (const widget of others) {
    const colSpan = widget.col_span ?? widthToSpan(widget.width)
    const rowSpan = normalizeRowSpan(widget)
    const box = { col: widget.col_start ?? 1, row: widget.row_start ?? 1, colSpan, rowSpan }
    while (placed.some(p => collidesBounds(box, p))) box.row += 1
    widget.row_start = box.row
    widget.row_span = rowSpan
    placed.push({ id: widget.id, ...box })
  }
  return next
}

function compactLayout(widgets: WidgetConfig[]) {
  // Sort by visual position first so compacting preserves the user's intended order.
  const sorted = [...widgets].sort(
    (a, b) => ((a.row_start ?? 1) - (b.row_start ?? 1)) || ((a.col_start ?? 1) - (b.col_start ?? 1)),
  )
  const placed: { col: number; row: number; colSpan: number; rowSpan: number }[] = []

  return sorted.map((widget, index) => {
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

function minColSpanForType(type?: string): number {
  if (type === 'pie') return 3
  if (type === 'line' || type === 'bar') return 4
  if (type === 'table' || type === 'combined') return 5
  return 2
}

function minRowSpanForType(type?: string): number {
  if (type === 'metric') return getMetricSnapRows()[0]
  if (type === 'pie') return 14
  if (type === 'line' || type === 'bar') return 11
  if (type === 'table' || type === 'combined') return 15
  return 9
}

export function DashboardClient({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [projeto, setProjeto] = useState<Projeto | null>(null)
  const [dashboardOptions, setDashboardOptions] = useState<Projeto[]>([])
  const [showDashboardSwitcher, setShowDashboardSwitcher] = useState(false)
  const [vendas, setVendas] = useState<Venda[]>([])
  const [previousVendas, setPreviousVendas] = useState<Venda[]>([])
  const [recentVendas, setRecentVendas] = useState<Venda[]>([])
  const [combinedVendas, setCombinedVendas] = useState<Venda[]>([])
  const [period, setPeriod] = useState<Period>('today')
  const [customFrom, setCustomFrom] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [customTo, setCustomTo] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })
  const [exchangeRate, setExchangeRate] = useState(5.85)
  const [theme, setTheme] = useState<DashboardTheme>('dark')
  const [loading, setLoading] = useState(true)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [custoTotal, setCustoTotal] = useState(0)

  const [widgets, setWidgets] = useState<WidgetConfig[]>([])
  const [loadingWidgets, setLoadingWidgets] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [showAddWidget, setShowAddWidget] = useState(false)
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null)
  const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null)
  const [selectedWidgetIds, setSelectedWidgetIds] = useState<Set<string>>(new Set())
  const selectedWidgetIdsRef = useRef<Set<string>>(new Set())
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
  const [productSearch, setProductSearch] = useState('')
  const [savingProducts, setSavingProducts] = useState(false)

  const customDateRange = useMemo((): { from: Date; to: Date } | undefined => {
    if (period !== 'custom') return undefined
    const parseLocal = (s: string) => {
      const [y, m, d] = s.split('-').map(Number)
      return new Date(y!, m! - 1, d!)
    }
    const from = parseLocal(customFrom)
    const to = new Date(parseLocal(customTo).getTime() + 86_400_000)
    return { from, to }
  }, [period, customFrom, customTo])

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
    const timer = window.setInterval(() => setNowTick(Date.now()), 10_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    function syncTheme() {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
      if (stored === 'dark' || stored === 'light') setTheme(stored)
    }
    queueMicrotask(syncTheme)
    window.addEventListener('storage', syncTheme)
    window.addEventListener('dash-theme-change', syncTheme)
    return () => {
      window.removeEventListener('storage', syncTheme)
      window.removeEventListener('dash-theme-change', syncTheme)
    }
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
      .from('projetos')
      .select('*')
      .order('data_criacao', { ascending: false })
      .then(({ data }) => setDashboardOptions((data ?? []) as Projeto[]))
  }, [])

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
        setPreviousVendas([])
        setRecentVendas([])
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
        setPreviousVendas([])
        setRecentVendas([])
        setCombinedVendas([])
        return
      }

      const { from, to } = getPeriodRange(period, customDateRange)
      const previousRange = getPreviousPeriodRange(period, customDateRange)

      const { data } = await supabase
        .from('vendas')
        .select('*')
        .in('hotmart_produto_id', hotmartIds)
        .gte('data_venda', from.toISOString())
        .lt('data_venda', to.toISOString())
        .order('data_venda', { ascending: false })

      setVendas((data ?? []) as Venda[])

      const { data: previousData } = await supabase
        .from('vendas')
        .select('*')
        .in('hotmart_produto_id', hotmartIds)
        .gte('data_venda', previousRange.from.toISOString())
        .lt('data_venda', previousRange.to.toISOString())
        .order('data_venda', { ascending: false })

      setPreviousVendas((previousData ?? []) as Venda[])

      const { data: recentData } = await supabase
        .from('vendas')
        .select('*')
        .in('hotmart_produto_id', hotmartIds)
        .eq('status', 'approved')
        .order('data_venda', { ascending: false })
        .limit(8)

      setRecentVendas((recentData ?? []) as Venda[])

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
      setLastUpdatedAt(new Date())
    } finally {
      setLoading(false)
    }
  }, [projectId, period, customDateRange])

  useEffect(() => {
    void Promise.resolve().then(fetchVendas)
  }, [fetchVendas])

  const fetchCustos = useCallback(async () => {
    const { from, to } = getPeriodRange(period, customDateRange)
    const { data } = await supabase
      .from('projeto_custos')
      .select('custo_brl')
      .eq('projeto_id', projectId)
      .gte('data', from.toISOString().split('T')[0])
      .lt('data', to.toISOString().split('T')[0])
    setCustoTotal((data ?? []).reduce((sum: number, row: { custo_brl: number }) => sum + (row.custo_brl ?? 0), 0))
  }, [projectId, period, customDateRange])

  useEffect(() => {
    void Promise.resolve().then(fetchCustos)
  }, [fetchCustos])

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
      const row_start = Math.max(
        1,
        Math.round(((currentRow - 1) * rowStep + delta.y) / rowStep) + 1,
      )

      return { id, col_start, row_start, col_span: colSpan, row_span: rowSpan }
    },
    [widgets],
  )

  // Keep ref in sync so drag callbacks always read current selection without stale closure.
  useEffect(() => { selectedWidgetIdsRef.current = selectedWidgetIds }, [selectedWidgetIds])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = String(event.active.id)
    setActiveWidgetId(id)
    // If dragging an unselected widget, reset selection to just that widget.
    setSelectedWidgetIds(prev => prev.has(id) ? prev : new Set([id]))
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
      const draggedId = String(event.active.id)
      const placement = dragPreview ?? getPlacementFromDelta(draggedId, event.delta)
      setDragPreview(null)
      if (!placement) return
      pushHistory()
      setWidgets(prev => {
        const dragged = prev.find(w => w.id === draggedId)
        if (!dragged) return prev
        const activeIds = selectedWidgetIdsRef.current
        const deltaCol = placement.col_start - (dragged.col_start ?? 1)
        const deltaRow = placement.row_start - (dragged.row_start ?? 1)
        const moved = prev.map(w => {
          if (w.id === draggedId) return { ...w, col_start: placement.col_start, row_start: placement.row_start }
          if (!activeIds.has(w.id)) return w
          const colSpan = w.col_span ?? widthToSpan(w.width)
          return {
            ...w,
            col_start: Math.min(GRID_COLUMNS - colSpan + 1, Math.max(1, (w.col_start ?? 1) + deltaCol)),
            row_start: Math.max(1, (w.row_start ?? 1) + deltaRow),
          }
        })
        return resolveOverlapsMulti(moved, activeIds)
      })
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
    setWidgets(prev => compactLayout(prev.filter(w => w.id !== id)))
    setSavedWidgets(prev => compactLayout(prev.filter(w => w.id !== id)))
    setSelectedWidgetIds(prev => { const next = new Set(prev); next.delete(id); return next })
  }, [])

  const duplicateWidget = useCallback(async (id: string) => {
    const source = widgets.find(w => w.id === id)
    if (!source) return
    await addWidget({
      type: source.type,
      data_source: source.data_source,
      title: `${source.title} (cópia)`,
      width: source.width,
      height: source.height,
      col_span: source.col_span,
      row_span: source.row_span,
    })
  }, [widgets]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateWidget = useCallback(async (
    id: string,
    updates: { type: WidgetType; data_source: WidgetDataSource; title: string },
  ) => {
    const { error } = await supabase.from('dashboard_widgets').update(updates).eq('id', id)
    if (error) { setWidgetError(error.message); return }
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w))
    setSavedWidgets(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w))
    setEditingWidgetId(null)
  }, [])

  const getResizePlacement = useCallback((
    id: string,
    width: number,
    height: number,
    direction: ResizeDirection = 'bottom-right',
    deltaX = 0,
    deltaY = 0,
  ): GridPlacement | null => {
    const grid = gridRef.current
    const widget = widgets.find(w => w.id === id)
    if (!grid || !widget) return null

    const rect = grid.getBoundingClientRect()
    const colWidth = rect.width / GRID_COLUMNS
    const currentCol = widget.col_start ?? 1
    const currentRow = widget.row_start ?? 1
    const currentColSpan = widget.col_span ?? widthToSpan(widget.width)
    const currentRowSpan = normalizeRowSpan(widget)
    const affectsLeft = direction.includes('left')
    const affectsRight = direction.includes('right')
    const affectsTop = direction.includes('top')
    const affectsBottom = direction.includes('bottom')

    let col_start = currentCol
    let row_start = currentRow
    let col_span = currentColSpan
    let row_span = currentRowSpan

    if (affectsLeft) {
      const colDelta = Math.round(deltaX / colWidth)
      col_start = Math.min(currentCol + currentColSpan - 2, Math.max(1, currentCol + colDelta))
      col_span = currentColSpan - (col_start - currentCol)
    } else if (affectsRight) {
      col_span = normalizeColSpan(Math.round((width + GRID_ITEM_PADDING * 2) / colWidth))
    }

    const minCols = minColSpanForType(widget.type)
    const minRows = minRowSpanForType(widget.type)
    col_span = Math.min(GRID_COLUMNS - col_start + 1, Math.max(minCols, normalizeColSpan(col_span)))

    if (affectsTop) {
      const rowDelta = Math.round(deltaY / GRID_ROW_HEIGHT)
      row_start = Math.min(currentRow + currentRowSpan - minRows, Math.max(1, currentRow + rowDelta))
      row_span = currentRowSpan - (row_start - currentRow)
    } else if (affectsBottom) {
      row_span = Math.max(minRows, Math.round((height + GRID_ITEM_PADDING * 2) / GRID_ROW_HEIGHT))
    }

    row_span = Math.max(minRows, row_span)

    if (widget.type === 'metric') {
      row_span = snapToMetricRows(row_span)
      if (affectsTop) {
        row_start = Math.max(1, currentRow + currentRowSpan - row_span)
      }
    }

    return {
      id,
      col_start,
      row_start,
      col_span,
      row_span,
    }
  }, [widgets])

  const previewWidgetResize = useCallback((id: string, width: number, height: number, direction: ResizeDirection, deltaX: number, deltaY: number) => {
    setResizePreview(getResizePlacement(id, width, height, direction, deltaX, deltaY))
  }, [getResizePlacement])

  const commitWidgetResize = useCallback((id: string, width: number, height: number, direction: ResizeDirection, deltaX: number, deltaY: number) => {
    const placement = getResizePlacement(id, width, height, direction, deltaX, deltaY)
    setResizePreview(null)
    if (!placement) return
    pushHistory()
    setWidgets(prev => resolveOverlaps(prev.map(w => applyPlacement(w, placement)), id))
  }, [getResizePlacement, pushHistory])

  const organizeLayout = useCallback(() => {
    pushHistory()
    setWidgets(prev => compactLayout(prev))
  }, [pushHistory])

  const cancelLayout = useCallback(() => {
    setWidgets(savedWidgets)
    setUndoStack([])
    setRedoStack([])
    setLayoutError(null)
    setEditMode(false)
    setSelectedWidgetIds(new Set())
  }, [savedWidgets])

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
      setEditMode(false)
      setSelectedWidgetIds(new Set())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível salvar o layout.'
      if (message.includes('schema cache') || message.includes('col_span')) {
        persistLocalLayout(projectId, widgets)
        setSavedWidgets(widgets)
        setUndoStack([])
        setRedoStack([])
        setLayoutError(null)
        setEditMode(false)
        setSelectedWidgetIds(new Set())
      } else {
        setLayoutError(message)
      }
    } finally {
      setSavingLayout(false)
    }
  }, [projectId, widgets])

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
    setProductSearch('')
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

  useEffect(() => {
    if (!editMode) return
    function handleDocClick(e: MouseEvent) {
      const target = e.target as Element
      if (!target.closest('.dashboard-widget-shell')) {
        setSelectedWidgetIds(new Set())
      }
    }
    document.addEventListener('click', handleDocClick)
    return () => document.removeEventListener('click', handleDocClick)
  }, [editMode])

  const isReady = !loadingWidgets
  const hasUnsavedLayout = !sameLayout(widgets, savedWidgets)
  const previewPlacement = dragPreview ?? resizePreview
  const displayVendas = vendas
  const displayCombinedVendas = combinedVendas
  const displayCustoTotal = custoTotal
  const approvedRecentVendas = recentVendas.filter(v => v.status === 'approved')
  const latestSale = approvedRecentVendas[0]
  const countryDisplay = (country?: string | null) => {
    const code = (country || '').trim().toUpperCase()
    const labels: Record<string, string> = {
      BR: '🇧🇷 Brasil',
      US: '🇺🇸 US',
      USA: '🇺🇸 US',
      GB: '🇬🇧 UK',
      UK: '🇬🇧 UK',
      PT: '🇵🇹 Portugal',
      ES: '🇪🇸 Espanha',
      FR: '🇫🇷 França',
      DE: '🇩🇪 Alemanha',
      IT: '🇮🇹 Itália',
      CA: '🇨🇦 Canadá',
      AU: '🇦🇺 Austrália',
      MX: '🇲🇽 México',
      AR: '🇦🇷 Argentina',
      CL: '🇨🇱 Chile',
      CO: '🇨🇴 Colômbia',
    }
    return labels[code] ?? (code || 'Unknown')
  }
  const formatSaleAmount = (venda: Venda) => {
    const value = venda.valor ?? 0
    return venda.moeda === 'USD'
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
      : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
  }
  const countryRanking = useMemo(() => {
    const groups = new Map<string, { label: string; count: number; revenue: number }>()
    for (const venda of vendas.filter(v => v.status === 'approved')) {
      const code = (venda.pais || '').trim().toUpperCase()
      const label = code ? code : 'Unknown'
      const current = groups.get(label) ?? { label, count: 0, revenue: 0 }
      current.count += 1
      current.revenue += venda.valor ?? 0
      groups.set(label, current)
    }
    return Array.from(groups.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  }, [vendas])
  const insights = useMemo(() => {
    const approved = vendas.filter(v => v.status === 'approved')
    const topCountry = countryRanking[0]?.label
    const topProduct = Object.entries(approved.reduce<Record<string, number>>((acc, venda) => {
      const key = venda.produto || 'Produto'
      acc[key] = (acc[key] ?? 0) + (venda.valor ?? 0)
      return acc
    }, {})).sort((a, b) => b[1] - a[1])[0]?.[0]
    return [
      approved.length > 0 ? `${approved.length} vendas aprovadas no período.` : 'Aguardando vendas aprovadas no período.',
      topCountry ? `${topCountry} lidera em receita entre os países.` : 'Mapa de países pronto para novas vendas.',
      topProduct ? `${topProduct} lidera o faturamento.` : 'Produtos aparecerão aqui assim que houver dados.',
    ]
  }, [countryRanking, vendas])
  void nowTick
  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase()
    if (!query) return allProducts
    return allProducts.filter(product =>
      product.nome.toLowerCase().includes(query) ||
      product.hotmart_id.toLowerCase().includes(query),
    )
  }, [allProducts, productSearch])
  const displayedWidgets = useMemo(() => {
    if (!previewPlacement) return widgets
    const draggedId = previewPlacement.id
    const dragged = widgets.find(w => w.id === draggedId)
    if (!dragged) return widgets
    const activeIds = selectedWidgetIds
    const deltaCol = previewPlacement.col_start - (dragged.col_start ?? 1)
    const deltaRow = previewPlacement.row_start - (dragged.row_start ?? 1)
    return widgets.map(w => {
      if (w.id === draggedId) return applyPlacement(w, previewPlacement)
      if (activeIds.has(w.id)) {
        const colSpan = w.col_span ?? widthToSpan(w.width)
        return {
          ...w,
          col_start: Math.min(GRID_COLUMNS - colSpan + 1, Math.max(1, (w.col_start ?? 1) + deltaCol)),
          row_start: Math.max(1, (w.row_start ?? 1) + deltaRow),
        }
      }
      return w
    })
  }, [previewPlacement, widgets, selectedWidgetIds])

  return (
    <div className="dashboard-shell min-h-screen text-[var(--dash-text)]" data-dashboard-theme={theme}>
      <header
        className="sticky top-0 z-40 border-b border-[var(--dash-border)] bg-[color:var(--dash-bg)]/88 shadow-lg shadow-black/10 backdrop-blur-sm"
      >
        <div className="mx-auto flex min-h-14 max-w-[1400px] flex-wrap items-center gap-2.5 px-4 py-2 sm:px-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm text-[var(--dash-faint)] transition-colors hover:text-[var(--dash-text)]"
          >
            <ArrowLeft size={15} />
            Dashboards
          </Link>
          <div className="hidden h-5 w-px bg-[var(--dash-border)] sm:block" />
          <div className="dashboard-topbar flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl px-2.5 py-1.5 sm:px-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-500 text-white shadow-md shadow-cyan-500/15">
              <Rocket size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--dash-faint)]">
                Dashboard
              </p>
              <h1 className="truncate text-base font-extrabold text-[var(--dash-text)] sm:text-lg">
                {projeto?.nome ?? '...'}
              </h1>
            </div>
            {dashboardOptions.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowDashboardSwitcher(prev => !prev)}
                  className="flex min-w-0 items-center gap-2.5 rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)] px-2.5 py-1.5 text-left shadow-md shadow-black/10 transition-colors hover:border-[var(--dash-border-strong)] sm:min-w-60"
                  title="Trocar dashboard"
                >
                  <div className="grid h-8 w-10 shrink-0 grid-cols-3 items-end gap-1 rounded-lg bg-gradient-to-br from-cyan-400/20 to-violet-500/20 p-1.5">
                    <span className="h-3 rounded-full bg-cyan-300/80" />
                    <span className="h-5 rounded-full bg-violet-300/80" />
                    <span className="h-4 rounded-full bg-sky-200/80" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-extrabold text-[var(--dash-text)]">{projeto?.nome ?? 'Dashboard'}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dash-faint)]">Ativo</p>
                  </div>
                  <ChevronDown size={15} className={`shrink-0 text-[var(--dash-muted)] transition-transform ${showDashboardSwitcher ? 'rotate-180' : ''}`} />
                </button>

                {showDashboardSwitcher && (
                  <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowDashboardSwitcher(false)} />
                  <div className="absolute right-0 top-full z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-[var(--dash-border)] bg-[var(--dash-panel)] p-2 shadow-2xl shadow-black/35 backdrop-blur-2xl">
                    <div className="px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--dash-faint)]">Trocar dashboard</p>
                    </div>
                    <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
                      {dashboardOptions.map(option => {
                        const active = option.id === projectId
                        return (
                          <button
                            key={option.id}
                            onClick={() => {
                              setShowDashboardSwitcher(false)
                              if (!active) router.push(`/dashboard/${option.id}`)
                            }}
                            className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-all ${
                              active
                                ? 'bg-gradient-to-r from-cyan-400/15 to-violet-500/15 text-[var(--dash-text)]'
                                : 'text-[var(--dash-muted)] hover:bg-white/5 hover:text-[var(--dash-text)]'
                            }`}
                          >
                            <div className="grid h-11 w-14 shrink-0 grid-cols-3 items-end gap-1 rounded-2xl border border-[var(--dash-border)] bg-gradient-to-br from-cyan-400/15 to-violet-500/15 p-2">
                              <span className="h-4 rounded-full bg-cyan-300/75" />
                              <span className="h-7 rounded-full bg-violet-300/75" />
                              <span className="h-5 rounded-full bg-sky-200/75" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-black">{option.nome}</p>
                              <p className="text-xs text-[var(--dash-faint)]">{active ? 'Dashboard ativo' : 'Pronto para abrir'}</p>
                            </div>
                            {active && <Check size={17} className="text-cyan-300" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="ml-auto" />
        </div>
      </header>

      <main className="dashboard-main mx-auto max-w-[1400px] px-6 py-6">
        <div className="dashboard-toolbar sticky top-14 z-30 mb-5 flex flex-col gap-1.5 overflow-visible rounded-xl border border-[var(--dash-border)] bg-[rgba(12,14,24,0.88)] p-1.5 shadow-sm backdrop-blur-sm lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <PeriodFilter
              value={period}
              onChange={setPeriod}
              customFrom={customFrom}
              customTo={customTo}
              updatedAt={lastUpdatedAt}
              onCustomChange={(from, to) => { setCustomFrom(from); setCustomTo(to) }}
            />
          </div>
          <div className="dashboard-action-bar dashboard-panel ml-auto flex max-w-full shrink-0 flex-nowrap items-center justify-end gap-1.5 overflow-x-auto rounded-xl p-1">
            <button
              onClick={fetchVendas}
              title="Atualizar"
              className="flex shrink-0 items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-3 py-1.5 text-sm font-semibold text-white shadow-md shadow-cyan-500/15 transition-colors"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </button>
            {!editMode ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditMode(true)
                  setSelectedWidgetIds(new Set())
                }}
                className="shrink-0"
              >
                <Pencil size={13} />
                Editar layout
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={undoLayout}
                  disabled={undoStack.length === 0}
                  title="Desfazer última edição"
                  className="shrink-0"
                >
                  <Undo2 size={13} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={redoLayout}
                  disabled={redoStack.length === 0}
                  title="Refazer edição"
                  className="shrink-0"
                >
                  <Redo2 size={13} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={organizeLayout}
                  title="Organizar widgets em sequência"
                  className="shrink-0"
                >
                  <LayoutDashboard size={13} />
                  Organizar
                </Button>
                <Button
                  size="sm"
                  onClick={saveLayout}
                  disabled={!hasUnsavedLayout || savingLayout}
                  className="shrink-0"
                >
                  {savingLayout ? <Spinner size={13} /> : <Save size={13} />}
                  Salvar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={cancelLayout}
                  title="Cancelar edições e voltar ao layout salvo"
                  className="shrink-0 border-red-400/30 bg-red-500/10 text-red-300"
                >
                  <X size={13} />
                  Cancelar
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowAddWidget(true)} className="shrink-0">
                  <Plus size={13} />
                  Adicionar Widget
                </Button>
              </>
            )}
            {!editMode && (
              <Button variant="outline" size="sm" onClick={openProductsModal} className="shrink-0">
                <Settings size={13} />
                Configurar produtos
              </Button>
            )}
          </div>
        </div>
        {editMode && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)] px-4 py-3 text-xs text-[var(--dash-muted)] shadow-xl shadow-black/20">
            <span>
              {selectedWidgetIds.size > 0
                ? selectedWidgetIds.size > 1
                  ? `${selectedWidgetIds.size} widgets selecionados. Arraste qualquer um para mover o grupo.`
                  : 'Widget selecionado. Arraste o card ou aproxime o mouse das bordas para redimensionar.'
                : 'Clique para selecionar · Shift+clique para selecionar múltiplos · Arraste para mover.'}
            </span>
            <span className={layoutError ? 'font-semibold text-red-300' : hasUnsavedLayout ? 'font-semibold text-[var(--dash-neon)]' : 'text-[var(--dash-faint)]'}>
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
          <div className="relative">
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
                className="dashboard-grid relative grid"
                style={{
                  gridAutoRows: `${GRID_ROW_HEIGHT}px`,
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
                    vendas={displayVendas}
                    previousVendas={previousVendas}
                    combinedVendas={displayCombinedVendas}
                    period={period}
                    exchangeRate={exchangeRate}
                    custoTotal={displayCustoTotal}
                    customRange={customDateRange}
                    editMode={editMode}
                    loading={false}
                    selected={selectedWidgetIds.has(w.id)}
                    isGroupDragging={!!activeWidgetId && selectedWidgetIds.has(w.id) && w.id !== activeWidgetId}
                    onSelect={(id, multi) => {
                      if (multi) {
                        setSelectedWidgetIds(prev => {
                          const next = new Set(prev)
                          if (next.has(id)) next.delete(id); else next.add(id)
                          return next
                        })
                      } else {
                        setSelectedWidgetIds(new Set([id]))
                      }
                    }}
                    onDelete={deleteWidget}
                    onDuplicate={editMode ? duplicateWidget : undefined}
                    onEdit={editMode ? setEditingWidgetId : undefined}
                    onPreviewResize={previewWidgetResize}
                    onCommitResize={commitWidgetResize}
                  />
                ))}
              </div>
              <DragOverlay dropAnimation={null}>
                {activeWidgetId ? (
                  <div className="flex items-center gap-2 rounded-2xl border border-cyan-400/30 bg-[#1d1d31]/90 px-5 py-4 text-sm font-semibold text-slate-100 shadow-2xl shadow-cyan-500/20 backdrop-blur">
                    {selectedWidgetIds.size > 1 && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500 text-[10px] font-black text-white">
                        {selectedWidgetIds.size}
                      </span>
                    )}
                    {widgets.find(w => w.id === activeWidgetId)?.title}
                    {selectedWidgetIds.size > 1 && (
                      <span className="text-xs font-normal text-slate-400">
                        +{selectedWidgetIds.size - 1} mais
                      </span>
                    )}
                  </div>
                ) : null}
              </DragOverlay>
          </DndContext>
          <aside className="dashboard-panel fixed right-4 top-28 z-20 hidden max-h-[calc(100vh-8rem)] w-56 overflow-y-auto rounded-xl p-2 xl:block">
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-emerald-400/12 bg-emerald-400/[0.04] px-2 py-1.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-45" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">Ao vivo</p>
                <p className="truncate text-[11px] text-[var(--dash-faint)]">Última venda {formatRelativeTime(latestSale?.data_venda)}</p>
              </div>
            </div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--dash-muted)]">Últimas vendas</h3>
              <span className="h-2 w-2 rounded-full bg-emerald-300" />
            </div>
            <div className="relative max-h-[360px] space-y-1 overflow-y-auto pr-1">
              {approvedRecentVendas.length === 0 ? (
                <p className="py-6 text-center text-xs text-[var(--dash-faint)]">Aguardando vendas</p>
              ) : approvedRecentVendas.map(venda => {
                const renderedCountryLabel = countryDisplay(venda.pais)
                return (
                <div key={venda.id} className="group rounded-lg border border-white/[0.06] bg-white/[0.025] px-2 py-1.5 transition-colors hover:border-emerald-300/18 hover:bg-white/[0.045]">
                  <div className="mb-0.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5">
                    <span className="truncate text-[11px] font-medium text-[var(--dash-text)]">
                      {renderedCountryLabel} • {formatSaleAmount(venda)}
                    </span>
                    <span className="shrink-0 rounded-full bg-emerald-400/[0.08] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-emerald-300">Live</span>
                  </div>
                  <p className="truncate text-[11px] font-normal leading-snug text-[var(--dash-muted)]">{venda.produto ?? 'Produto'}</p>
                  <p className="mt-1 text-[10px] text-[var(--dash-faint)]">{formatRelativeTime(venda.data_venda)}</p>
                </div>
              )})}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[var(--dash-panel)] to-transparent" />
            </div>
            <div className="mt-3 border-t border-white/[0.06] pt-2.5">
              <h3 className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-[var(--dash-muted)]">Insights automáticos</h3>
              <div className="space-y-1.5">
                {insights.map((item, index) => (
                  <div key={index} className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-1.5 text-[11px] leading-4 text-[var(--dash-muted)]">
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 border-t border-white/[0.06] pt-2.5">
              <h3 className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-[var(--dash-muted)]">Mapa de países</h3>
              <div className="space-y-1.5">
                {(countryRanking.length ? countryRanking : [{ label: 'Unknown', count: 0, revenue: 0 }]).map((country, index) => (
                  <div key={country.label} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg bg-white/[0.025] px-2 py-1.5">
                    <div>
                      <p className="text-xs font-bold text-[var(--dash-text)]">{country.label === 'Unknown' ? '🌐 Unknown' : `🌐 ${country.label}`}</p>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400" style={{ width: `${Math.max(8, 100 - index * 18)}%` }} />
                      </div>
                    </div>
                    <p className="text-[10px] font-bold text-[var(--dash-faint)]">{country.count} vendas</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
          </div>
        )}
      </main>

      <AddWidgetModal
        open={showAddWidget}
        onClose={() => setShowAddWidget(false)}
        onAdd={async (newWidgets) => {
          for (const w of newWidgets) await addWidget(w)
        }}
      />

      <EditWidgetModal
        open={editingWidgetId !== null}
        widget={widgets.find(w => w.id === editingWidgetId) ?? null}
        onClose={() => setEditingWidgetId(null)}
        onSave={updateWidget}
      />

      <Modal
        open={showProducts}
        onClose={() => setShowProducts(false)}
        title="Configurar Produtos"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          {/* Header info */}
          <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/3 px-4 py-3">
            <p className="text-xs text-slate-400">
              Somente vendas dos produtos selecionados aparecem no dashboard.
            </p>
            {linkedIds.length > 0 && (
              <span className="ml-3 shrink-0 rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-xs font-bold text-indigo-300">
                {linkedIds.length} selecionado{linkedIds.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              type="text"
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              placeholder="Buscar por nome ou ID..."
              className="h-10 w-full rounded-xl border border-white/10 bg-[#10101d] pl-9 pr-3 text-sm text-slate-200 placeholder-slate-600 outline-none transition-colors focus:border-indigo-500/60"
            />
          </div>

          {/* Select all / deselect all */}
          {allProducts.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => setLinkedIds(allProducts.map(p => p.id))}
                className="text-xs font-medium text-indigo-400 transition-colors hover:text-indigo-300"
              >
                Selecionar todos
              </button>
              <span className="text-slate-700">·</span>
              <button
                onClick={() => setLinkedIds([])}
                className="text-xs font-medium text-slate-500 transition-colors hover:text-slate-300"
              >
                Limpar seleção
              </button>
            </div>
          )}

          {/* Product list */}
          {allProducts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5">
                <Settings size={20} className="text-slate-600" />
              </div>
              <p className="text-sm text-slate-500">Nenhum produto cadastrado.</p>
              <p className="text-xs text-slate-600">Aguarde os webhooks da Hotmart.</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-600">Nenhum produto encontrado.</p>
          ) : (
            <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {filteredProducts.map(p => {
                const checked = linkedIds.includes(p.id)
                return (
                  <label
                    key={p.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition-all ${
                      checked
                        ? 'border-indigo-500/30 bg-indigo-500/8'
                        : 'border-transparent bg-white/3 hover:border-white/8 hover:bg-white/5'
                    }`}
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-black ${
                      checked ? 'bg-indigo-500 text-white' : 'bg-white/8 text-slate-400'
                    }`}>
                      {checked
                        ? <Check size={14} />
                        : p.nome.charAt(0).toUpperCase()
                      }
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-200">{p.nome}</p>
                      <p className="font-mono text-[11px] text-slate-600">{p.hotmart_id}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e =>
                        setLinkedIds(prev =>
                          e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id),
                        )
                      }
                      className="sr-only"
                    />
                  </label>
                )
              })}
            </div>
          )}

          <div className="flex gap-2 pt-1">
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
