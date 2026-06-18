'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
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
  Trash2,
  Undo2,
  Redo2,
  X,
} from 'lucide-react'
import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import { supabase } from '@/lib/supabase'
import { formatRelativeTime, getPeriodRange, getPreviousPeriodRange, getOfficialSaleAmount, parseOrigem } from '@/lib/utils'
import type { Venda, Projeto, Produto, Period, WidgetConfig, WidgetType, WidgetDataSource } from '@/lib/types'
import { PeriodFilter } from '@/components/dashboard/PeriodFilter'
import { AddWidgetModal } from '@/components/dashboard/AddWidgetModal'
import { EditWidgetModal } from '@/components/dashboard/EditWidgetModal'

import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import type { MetaCreativeResult, MetaCampaignResult } from '@/lib/meta-ads-mock'

const GRID_COLUMNS = 12
const LAYOUT_STORAGE_PREFIX = 'dashboard-layout:'
const THEME_STORAGE_KEY = 'dashboard-theme'

// Three content-aware snap heights for metric cards:
// 7 rows = icon + title + value
// 8 rows = + subValue
// 9 rows = + comparison
const METRIC_SNAP_ROWS: [number, number, number] = [7, 8, 9]

function snapToMetricRows(rowSpan: number): number {
  return METRIC_SNAP_ROWS.reduce((best, snap) =>
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

type ProdutoOferta = {
  produto_id: string
  codigo: string
  nome: string
  preco: number | null
  moeda: string | null
}

type ProjetoProdutoLink = {
  produto_id: string
  todas_ofertas?: boolean | null
}

type ProjetoProdutoOfertaLink = {
  produto_id: string
  oferta_codigo: string
  oferta_nome: string
  oferta_preco?: number | null
  oferta_moeda?: string | null
}

type OfferSelectionMode = 'all' | 'custom'

function formatOfferPrice(preco?: number | null, moeda?: string | null): string | null {
  if (preco == null || Number.isNaN(Number(preco))) return null
  const currency = moeda || 'BRL'
  try {
    return new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'pt-BR', {
      style: 'currency',
      currency,
    }).format(Number(preco))
  } catch {
    return `${currency} ${Number(preco).toFixed(2)}`
  }
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
  if (type === 'metric') return METRIC_SNAP_ROWS[1]
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

// After any drop, pull every bottom-most widget up to touch the nearest widget above it,
// eliminating trailing empty space at the end of the grid.
function applyBottomMagnet(layout: WidgetConfig[]): WidgetConfig[] {
  if (layout.length === 0) return layout
  const maxRowEnd = Math.max(...layout.map(w => (w.row_start ?? 1) + normalizeRowSpan(w)))
  const bottomIds = new Set(
    layout
      .filter(w => (w.row_start ?? 1) + normalizeRowSpan(w) === maxRowEnd)
      .map(w => w.id),
  )
  let result = layout
  for (const id of bottomIds) {
    const widget = result.find(w => w.id === id)
    if (!widget) continue
    const rowStart = widget.row_start ?? 1
    const colStart = widget.col_start ?? 1
    const colSpan = widget.col_span ?? widthToSpan(widget.width)
    const above = result
      .filter(w => {
        if (bottomIds.has(w.id)) return false
        const wCol = w.col_start ?? 1
        const wSpan = w.col_span ?? widthToSpan(w.width)
        return wCol < colStart + colSpan && wCol + wSpan > colStart
      })
      .map(w => (w.row_start ?? 1) + normalizeRowSpan(w))
    const newRowStart = above.length > 0 ? Math.max(...above) : 1
    if (newRowStart < rowStart) {
      result = result.map(w => w.id === id ? { ...w, row_start: newRowStart } : w)
    }
  }
  return result
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
  if (type === 'metric') return METRIC_SNAP_ROWS[0]
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
  const [selectedWidgetIds, setSelectedWidgetIds] = useState<Set<string>>(new Set())
  const [savedWidgets, setSavedWidgets] = useState<WidgetConfig[]>([])
  const [undoStack, setUndoStack] = useState<WidgetConfig[][]>([])
  const [redoStack, setRedoStack] = useState<WidgetConfig[][]>([])
  const [savingLayout, setSavingLayout] = useState(false)
  const [layoutError, setLayoutError] = useState<string | null>(null)
  const [widgetError, setWidgetError] = useState<string | null>(null)
  const [undoToast, setUndoToast] = useState(false)
  const undoToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [showProducts, setShowProducts] = useState(false)
  const [allProducts, setAllProducts] = useState<Produto[]>([])
  const [linkedIds, setLinkedIds] = useState<string[]>([])
  const [productOffers, setProductOffers] = useState<Record<string, ProdutoOferta[]>>({})
  const [offerModeByProduct, setOfferModeByProduct] = useState<Record<string, OfferSelectionMode>>({})
  const [selectedOfferCodes, setSelectedOfferCodes] = useState<Record<string, string[]>>({})
  const [productSearch, setProductSearch] = useState('')
  const [showOnlySelected, setShowOnlySelected] = useState(false)
  const [savingProducts, setSavingProducts] = useState(false)

  const [linkedMetaAccountId, setLinkedMetaAccountId] = useState<string | null>(null)
  const [metaCacheUpdatedAt, setMetaCacheUpdatedAt] = useState<string | null>(null)
  const [metaInsights, setMetaInsights] = useState<Record<string, unknown> | null>(null)
  const [metaAds, setMetaAds] = useState<MetaCreativeResult | null>(null)
  const [metaCampaigns, setMetaCampaigns] = useState<MetaCampaignResult | null>(null)
  const [showClearModal, setShowClearModal] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [successToast, setSuccessToast] = useState<string | null>(null)

  const [origensDisponiveis, setOrigensDisponiveis] = useState<string[]>([])
  const [origensFilter, setOrigensFilter] = useState<string[]>([])
  const [showOrigensDropdown, setShowOrigensDropdown] = useState(false)
  const origensDropdownRef = useRef<HTMLDivElement>(null)

  const [afiliadosDisponiveis, setAfiliadosDisponiveis] = useState<string[]>([])
  const [afiliadosFilter, setAfiliadosFilter] = useState<string[]>([])
  const [showAfiliadosDropdown, setShowAfiliadosDropdown] = useState(false)
  const afiliadosDropdownRef = useRef<HTMLDivElement>(null)
  const dashboardSwitcherRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    async function loadLinkedAccount() {
      // Prefer new meta_project_accounts table (multi-account)
      const { data: pa } = await supabase
        .from('meta_project_accounts')
        .select('account_id')
        .eq('projeto_id', projectId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      console.log('[META] loadLinkedAccount projeto_id:', projectId, '| meta_project_accounts:', pa)
      if (pa?.account_id) { setLinkedMetaAccountId(pa.account_id); return }

      // Fallback: legacy account_id stored in meta_connections
      const { data: mc } = await supabase
        .from('meta_connections')
        .select('account_id')
        .eq('projeto_id', projectId)
        .eq('status', 'connected')
        .maybeSingle()
      console.log('[META] loadLinkedAccount fallback meta_connections:', mc)
      setLinkedMetaAccountId((mc as { account_id: string | null } | null)?.account_id ?? null)
    }
    void loadLinkedAccount()
  }, [projectId])

  useEffect(() => {
    if (!linkedMetaAccountId) { setMetaInsights(null); return }
    const presetMap: Partial<Record<string, string>> = {
      today: 'today', yesterday: 'yesterday',
      thisWeek: 'this_week_mon_today', lastWeek: 'last_week_mon_sun',
      thisMonth: 'this_month', lastMonth: 'last_month',
      last7d: 'last_7d', last30d: 'last_30d',
    }
    const preset = presetMap[period]
    if (!preset) { setMetaInsights(null); return }
    fetch(`/api/meta/insights?account_id=${encodeURIComponent(linkedMetaAccountId)}&date_preset=${preset}&projeto_id=${encodeURIComponent(projectId)}`, { cache: 'no-store' })
      .then(r => {
        if (r.ok) {
          const updatedAt = r.headers.get('X-Cache-Updated-At')
          if (updatedAt) setMetaCacheUpdatedAt(updatedAt)
          return r.json() as Promise<Record<string, unknown>>
        }
        return null
      })
      .then(data => setMetaInsights(data))
      .catch(() => setMetaInsights(null))
  }, [linkedMetaAccountId, period])

  useEffect(() => {
    if (!linkedMetaAccountId) { setMetaAds(null); return }
    const presetMap: Partial<Record<string, string>> = {
      today: 'today', yesterday: 'yesterday',
      thisWeek: 'this_week_mon_today', lastWeek: 'last_week_mon_sun',
      thisMonth: 'this_month', lastMonth: 'last_month',
      last7d: 'last_7d', last30d: 'last_30d',
    }
    const preset = presetMap[period]
    if (!preset) { setMetaAds(null); return }
    fetch(`/api/meta/ads?account_id=${encodeURIComponent(linkedMetaAccountId)}&date_preset=${preset}&projeto_id=${encodeURIComponent(projectId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() as Promise<MetaCreativeResult> : null)
      .then(data => setMetaAds(data))
      .catch(() => setMetaAds(null))
  }, [linkedMetaAccountId, period, projectId])

  useEffect(() => {
    if (!linkedMetaAccountId) { setMetaCampaigns(null); return }
    const presetMap: Partial<Record<string, string>> = {
      today: 'today', yesterday: 'yesterday',
      thisWeek: 'this_week_mon_today', lastWeek: 'last_week_mon_sun',
      thisMonth: 'this_month', lastMonth: 'last_month',
      last7d: 'last_7d', last30d: 'last_30d',
    }
    const preset = presetMap[period]
    if (!preset) { setMetaCampaigns(null); return }
    fetch(`/api/meta/campaigns?account_id=${encodeURIComponent(linkedMetaAccountId)}&date_preset=${preset}&projeto_id=${encodeURIComponent(projectId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() as Promise<MetaCampaignResult> : null)
      .then(data => setMetaCampaigns(data))
      .catch(() => setMetaCampaigns(null))
  }, [linkedMetaAccountId, period, projectId])

  const filterRowsByOfferSelection = useCallback((
    rows: Venda[],
    produtos: { id: string; hotmart_id: string }[],
    productLinks: ProjetoProdutoLink[],
    offerLinks: ProjetoProdutoOfertaLink[],
  ) => {
    const productIdByHotmartId = new Map(produtos.map(p => [p.hotmart_id, p.id]))
    const allOfferProducts = new Set(
      productLinks
        .filter(link => link.todas_ofertas !== false)
        .map(link => link.produto_id),
    )
    const allowedOffersByProduct = offerLinks.reduce((acc, link) => {
      if (!acc[link.produto_id]) acc[link.produto_id] = new Set<string>()
      acc[link.produto_id]!.add(link.oferta_codigo)
      return acc
    }, {} as Record<string, Set<string>>)

    return rows.filter(venda => {
      const productId = venda.hotmart_produto_id ? productIdByHotmartId.get(venda.hotmart_produto_id) : undefined
      if (!productId) return false
      if (allOfferProducts.has(productId)) return true
      const allowedOffers = allowedOffersByProduct[productId]
      if (!allowedOffers || allowedOffers.size === 0) return false
      return !!venda.oferta_codigo && allowedOffers.has(venda.oferta_codigo)
    })
  }, [])

  const fetchVendas = useCallback(async () => {
    setLoading(true)
    try {
      const { data: pp } = await supabase
        .from('projeto_produtos')
        .select('produto_id, todas_ofertas')
        .eq('projeto_id', projectId)

      const productLinks = (pp ?? []) as ProjetoProdutoLink[]
      const produtoIds = productLinks.map(r => r.produto_id)

      if (produtoIds.length === 0) {
        setVendas([])
        setPreviousVendas([])
        setRecentVendas([])
        setCombinedVendas([])
        return
      }

      const { data: prods } = await supabase
        .from('produtos')
        .select('id, hotmart_id')
        .in('id', produtoIds)

      const products = (prods ?? []) as { id: string; hotmart_id: string }[]
      const hotmartIds = products.map(r => r.hotmart_id)

      if (hotmartIds.length === 0) {
        setVendas([])
        setPreviousVendas([])
        setRecentVendas([])
        setCombinedVendas([])
        return
      }

      const { from, to } = getPeriodRange(period, customDateRange)
      const previousRange = getPreviousPeriodRange(period, customDateRange)
      const { data: selectedOffers } = await supabase
        .from('projeto_produto_ofertas')
        .select('produto_id, oferta_codigo, oferta_nome, oferta_preco, oferta_moeda')
        .eq('projeto_id', projectId)
      const offerLinks = (selectedOffers ?? []) as ProjetoProdutoOfertaLink[]

      const { data } = await supabase
        .from('vendas')
        .select('*')
        .in('hotmart_produto_id', hotmartIds)
        .gte('data_venda', from.toISOString())
        .lt('data_venda', to.toISOString())
        .order('data_venda', { ascending: false })

      setVendas(filterRowsByOfferSelection((data ?? []) as Venda[], products, productLinks, offerLinks))

      const { data: previousData } = await supabase
        .from('vendas')
        .select('*')
        .in('hotmart_produto_id', hotmartIds)
        .gte('data_venda', previousRange.from.toISOString())
        .lt('data_venda', previousRange.to.toISOString())
        .order('data_venda', { ascending: false })

      setPreviousVendas(filterRowsByOfferSelection((previousData ?? []) as Venda[], products, productLinks, offerLinks))

      const { data: recentData } = await supabase
        .from('vendas')
        .select('*')
        .in('hotmart_produto_id', hotmartIds)
        .eq('status', 'approved')
        .order('data_venda', { ascending: false })
        .limit(80)

      setRecentVendas(filterRowsByOfferSelection((recentData ?? []) as Venda[], products, productLinks, offerLinks).slice(0, 8))

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

      setCombinedVendas(filterRowsByOfferSelection((combinedData ?? []) as Venda[], products, productLinks, offerLinks))
      setLastUpdatedAt(new Date())
    } finally {
      setLoading(false)
    }
  }, [projectId, period, customDateRange, filterRowsByOfferSelection])

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

  const fetchMetaAds = useCallback(async () => {
    if (!linkedMetaAccountId) return
    const presetMap: Partial<Record<string, string>> = {
      today: 'today', yesterday: 'yesterday',
      thisWeek: 'this_week_mon_today', lastWeek: 'last_week_mon_sun',
      thisMonth: 'this_month', lastMonth: 'last_month',
      last7d: 'last_7d', last30d: 'last_30d',
    }
    const preset = presetMap[period]
    if (!preset) return
    await Promise.all([
      supabase.from('meta_insights_cache').delete().eq('projeto_id', projectId).eq('date_preset', preset),
      supabase.from('meta_ads_cache').delete().eq('projeto_id', projectId).eq('date_preset', preset),
    ])
    const [insightsRes, adsRes, campaignsRes] = await Promise.all([
      fetch(`/api/meta/insights?account_id=${encodeURIComponent(linkedMetaAccountId)}&date_preset=${preset}&projeto_id=${encodeURIComponent(projectId)}`, { cache: 'no-store' }),
      fetch(`/api/meta/ads?account_id=${encodeURIComponent(linkedMetaAccountId)}&date_preset=${preset}&projeto_id=${encodeURIComponent(projectId)}`, { cache: 'no-store' }),
      fetch(`/api/meta/campaigns?account_id=${encodeURIComponent(linkedMetaAccountId)}&date_preset=${preset}&projeto_id=${encodeURIComponent(projectId)}`, { cache: 'no-store' }),
    ])
    if (insightsRes.ok) {
      const updatedAt = insightsRes.headers.get('X-Cache-Updated-At')
      if (updatedAt) setMetaCacheUpdatedAt(updatedAt)
      setMetaInsights(await insightsRes.json() as Record<string, unknown>)
    } else {
      setMetaInsights(null)
    }
    if (adsRes.ok) setMetaAds(await adsRes.json() as MetaCreativeResult)
    else setMetaAds(null)
    if (campaignsRes.ok) setMetaCampaigns(await campaignsRes.json() as MetaCampaignResult)
    else setMetaCampaigns(null)
  }, [linkedMetaAccountId, period, projectId])

  const fetchHotmartOrigens = useCallback(async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString()
    const { data } = await supabase
      .from('vendas')
      .select('id, hotmart_id')
      .is('origem', null)
      .eq('status', 'approved')
      .gte('data_venda', twoDaysAgo)
      .not('hotmart_id', 'is', null)

    const rows = (data ?? []) as { id: string; hotmart_id: string }[]
    if (rows.length === 0) return

    for (const row of rows) {
      try {
        const res = await fetch(`/api/hotmart/sync-origem?transaction=${encodeURIComponent(row.hotmart_id)}`, { cache: 'no-store' })
        if (res.ok) {
          const { origem } = await res.json()
          console.log('[SYNC ORIGEM]', row.hotmart_id, '→', origem ?? 'sem origem')
          if (origem) await supabase.from('vendas').update({ origem }).eq('id', row.id)
        }
      } catch {
        // ignore individual failures
      }
      await new Promise(resolve => setTimeout(resolve, 300))
    }
  }, [])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([fetchVendas(), fetchMetaAds()])
      setSuccessToast('Dados atualizados')
      setTimeout(() => setSuccessToast(null), 5000)
    } finally {
      setIsRefreshing(false)
    }
  }, [fetchVendas, fetchMetaAds])

  useEffect(() => {
    async function loadOrigens() {
      const { data: pp } = await supabase
        .from('projeto_produtos')
        .select('produto_id')
        .eq('projeto_id', projectId)
      const produtoIds = (pp ?? []).map((r: { produto_id: string }) => r.produto_id)
      if (produtoIds.length === 0) return

      const { data: prods } = await supabase
        .from('produtos')
        .select('hotmart_id')
        .in('id', produtoIds)
      const hotmartIds = (prods ?? []).map((r: { hotmart_id: string }) => r.hotmart_id)
      if (hotmartIds.length === 0) return

      const { data } = await supabase
        .from('vendas')
        .select('origem')
        .in('hotmart_produto_id', hotmartIds)
        .not('origem', 'is', null)

      const parsed = Array.from(
        new Set(
          (data ?? [])
            .map((r: { origem: string | null }) => parseOrigem(r.origem))
            .filter(o => o !== '—'),
        ),
      ).sort() as string[]
      setOrigensDisponiveis(parsed)
    }
    void loadOrigens()
  }, [projectId])

  useEffect(() => {
    async function loadAfiliados() {
      console.log('[AFILIADO] loadAfiliados iniciado, projectId:', projectId)

      const { data: pp, error: ppError } = await supabase
        .from('projeto_produtos')
        .select('produto_id')
        .eq('projeto_id', projectId)
      console.log('[AFILIADO] projeto_produtos:', pp, 'erro:', ppError)
      const produtoIds = (pp ?? []).map((r: { produto_id: string }) => r.produto_id)
      if (produtoIds.length === 0) {
        console.log('[AFILIADO] produtoIds vazio — saindo cedo')
        return
      }

      const { data: prods, error: prodsError } = await supabase
        .from('produtos')
        .select('hotmart_id')
        .in('id', produtoIds)
      console.log('[AFILIADO] hotmartIds encontrados:', (prods ?? []).map((r: { hotmart_id: string }) => r.hotmart_id), 'erro:', prodsError)
      const hotmartIds = (prods ?? []).map((r: { hotmart_id: string }) => r.hotmart_id)
      if (hotmartIds.length === 0) {
        console.log('[AFILIADO] hotmartIds vazio — saindo cedo')
        return
      }

      const { data, error: dataError } = await supabase
        .from('vendas')
        .select('afiliado_nome')
        .in('hotmart_produto_id', hotmartIds)
        .not('afiliado_nome', 'is', null)
        .not('afiliado_nome', 'eq', '')
      console.log('[AFILIADO] rows retornadas:', data, 'erro:', dataError)
      console.log('[AFILIADO] rows raw:', JSON.stringify(data))

      const unique = Array.from(
        new Set((data ?? []).map((r: { afiliado_nome: string | null }) => r.afiliado_nome).filter((v): v is string => !!v && v.trim() !== '')),
      ).sort()
      console.log('[AFILIADO] disponiveis:', unique)
      setAfiliadosDisponiveis(unique)
    }
    void loadAfiliados()
  }, [projectId])

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!afiliadosDropdownRef.current?.contains(e.target as Node)) setShowAfiliadosDropdown(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!dashboardSwitcherRef.current?.contains(e.target as Node)) setShowDashboardSwitcher(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const pushHistory = useCallback(() => {
    setUndoStack(prev => [...prev, widgets])
    setRedoStack([])
  }, [widgets])


  const addWidget = async (config: Omit<WidgetConfig, 'id' | 'projeto_id' | 'position'>) => {
    const position = widgets.length
    const col_span = widthToSpan(config.width)
    const row_span = heightToRows(config.height, config.type)
    const bounds = layoutBounds(widgets)
    const isFreeSlot = (c: number, r: number) =>
      !bounds.some(b => collidesBounds({ col: c, row: r, colSpan: col_span, rowSpan: row_span }, b))
    const searchMax = maxLayoutRow(widgets) + row_span
    let col_start = 1
    let row_start = maxLayoutRow(widgets) + 1
    let slotFound = false
    for (let r = 1; r <= searchMax && !slotFound; r++) {
      for (let c = 1; c <= GRID_COLUMNS - col_span + 1; c++) {
        if (isFreeSlot(c, r)) { col_start = c; row_start = r; slotFound = true; break }
      }
    }
    const payload = { ...config, projeto_id: projectId, position, col_start, row_start, col_span, row_span }
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
      const placed: WidgetConfig = { ...(data as WidgetConfig), col_start, row_start, col_span, row_span }
      console.log('[ADD_WIDGET] inserido em posição:', placed.col_start, placed.row_start)
      setWidgets(prev => [...prev, placed])
      setSavedWidgets(prev => [...prev, placed])
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

    const col_span = source.col_span ?? widthToSpan(source.width)
    const row_span = normalizeRowSpan(source)
    const srcCol = source.col_start ?? 1
    const srcRow = source.row_start ?? 1

    // Find a free slot: right of source → scan grid → after all widgets
    const bounds = layoutBounds(widgets)
    const isFree = (c: number, r: number) =>
      !bounds.some(b => collidesBounds({ col: c, row: r, colSpan: col_span, rowSpan: row_span }, b))

    let col_start = srcCol + col_span
    let row_start = srcRow
    if (col_start + col_span - 1 > GRID_COLUMNS || !isFree(col_start, row_start)) {
      const maxRow = maxLayoutRow(widgets) + row_span
      let found = false
      outer: for (let r = 1; r <= maxRow; r++) {
        for (let c = 1; c <= GRID_COLUMNS - col_span + 1; c++) {
          if (isFree(c, r)) { col_start = c; row_start = r; found = true; break outer }
        }
      }
      if (!found) { col_start = 1; row_start = maxLayoutRow(widgets) }
    }

    const position = widgets.length
    const payload = {
      type: source.type,
      data_source: source.data_source,
      title: `${source.title} (cópia)`,
      width: source.width,
      height: source.height,
      projeto_id: projectId,
      position,
      col_start,
      row_start,
      col_span,
      row_span,
    }

    setWidgetError(null)
    let { data, error } = await supabase.from('dashboard_widgets').insert(payload).select().single()

    if (error?.message.includes('schema cache')) {
      const legacy = { type: source.type, data_source: source.data_source, title: `${source.title} (cópia)`, width: source.width, height: source.height, projeto_id: projectId, position }
      const retry = await supabase.from('dashboard_widgets').insert(legacy).select().single()
      data = retry.data
      error = retry.error
    }

    if (error) { setWidgetError(error.message); return }
    if (!data) return

    setWidgets(prev => {
      const newWidget: WidgetConfig = { ...(data as WidgetConfig), col_start, row_start, col_span, row_span }
      return resolveOverlaps([...prev, newWidget], newWidget.id)
      // savedWidgets não atualizado aqui: mantém hasUnsavedLayout=true para o botão Salvar
    })
  }, [widgets, projectId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const clearAllWidgets = useCallback(async () => {
    await supabase.from('dashboard_widgets').delete().eq('projeto_id', projectId)
    setWidgets([])
    setSavedWidgets([])
    setSelectedWidgetIds(new Set())
    setUndoStack([])
    setRedoStack([])
    setShowClearModal(false)
    setEditMode(false)
  }, [projectId])

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
    const [
      { data: all },
      { data: linked },
      { data: selectedOffers },
    ] = await Promise.all([
      supabase.from('produtos').select('*').order('nome'),
      supabase.from('projeto_produtos').select('produto_id, todas_ofertas').eq('projeto_id', projectId),
      supabase.from('projeto_produto_ofertas').select('produto_id, oferta_codigo, oferta_nome, oferta_preco, oferta_moeda').eq('projeto_id', projectId),
    ])
    const products = (all ?? []) as Produto[]
    const hotmartIds = products.map(p => p.hotmart_id).filter(Boolean)
    const { data: offerRows } = hotmartIds.length > 0
      ? await supabase
          .rpc('get_distinct_ofertas', { hotmart_ids: hotmartIds })
          .select()
      : { data: [] }
    console.log('[OFERTAS DEBUG] hotmartIds:', hotmartIds)
    console.log('[OFERTAS DEBUG] offerRows count:', (offerRows ?? []).length)
    console.log('[OFERTAS DEBUG] offerRows xjdu2238:', (offerRows ?? []).filter((r: any) => r.oferta_codigo === 'xjdu2238'))
    const productIdByHotmartId = new Map(products.map(p => [p.hotmart_id, p.id]))
    const offersByProduct: Record<string, ProdutoOferta[]> = {}
    ;((offerRows ?? []) as Array<{
      hotmart_produto_id: string | null
      oferta_codigo: string | null
      oferta_nome: string | null
      oferta_preco: number | null
      oferta_moeda: string | null
    }>).forEach(row => {
      if (!row.hotmart_produto_id || !row.oferta_codigo) return
      const produtoId = productIdByHotmartId.get(row.hotmart_produto_id)
      if (!produtoId) return
      const existing = offersByProduct[produtoId]?.find(o => o.codigo === row.oferta_codigo)
      if (existing) {
        if (!existing.nome && row.oferta_nome) existing.nome = row.oferta_nome
        if (existing.preco == null && row.oferta_preco != null) existing.preco = row.oferta_preco
        if (!existing.moeda && row.oferta_moeda) existing.moeda = row.oferta_moeda
        return
      }
      if (!offersByProduct[produtoId]) offersByProduct[produtoId] = []
      offersByProduct[produtoId]!.push({
        produto_id: produtoId,
        codigo: row.oferta_codigo,
        nome: row.oferta_nome || '(sem nome)',
        preco: row.oferta_preco,
        moeda: row.oferta_moeda,
      })
    })
    await Promise.all(
      products.map(async (product) => {
        if (!product.hotmart_id) return
        try {
          const res = await fetch(`/api/hotmart/offers?product_id=${product.hotmart_id}`, {
            signal: AbortSignal.timeout(3000),
          })
          if (!res.ok) return
          const { offers } = await res.json() as { offers: { code: string; name: string; price: number | null; currency: string }[] }
          if (!offers?.length) return
          const produtoId = product.id
          if (!offersByProduct[produtoId]) offersByProduct[produtoId] = []
          for (const offer of offers) {
            if (!offer.code) continue
            const existing = offersByProduct[produtoId]!.find(o => o.codigo === offer.code)
            if (existing) {
              if (!existing.nome || existing.nome === '(sem nome)') existing.nome = offer.name || '(sem nome)'
              if (existing.preco == null && offer.price != null) existing.preco = offer.price
              if (!existing.moeda && offer.currency) existing.moeda = offer.currency
            } else {
              offersByProduct[produtoId]!.push({
                produto_id: produtoId,
                codigo: offer.code,
                nome: offer.name || '(sem nome)',
                preco: offer.price,
                moeda: offer.currency,
              })
            }
          }
        } catch {
          // falha silenciosa — ofertas da API são complementares
        }
      })
    )

    Object.values(offersByProduct).forEach(offers => {
      offers.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    })
    console.log('[OFERTAS] por produto:', JSON.stringify(offersByProduct, null, 2))
    const offerCodesByProduct = ((selectedOffers ?? []) as ProjetoProdutoOfertaLink[]).reduce((acc, row) => {
      if (!acc[row.produto_id]) acc[row.produto_id] = []
      acc[row.produto_id]!.push(row.oferta_codigo)
      return acc
    }, {} as Record<string, string[]>)
    const modes = ((linked ?? []) as ProjetoProdutoLink[]).reduce((acc, row) => {
      acc[row.produto_id] = row.todas_ofertas === false ? 'custom' : 'all'
      return acc
    }, {} as Record<string, OfferSelectionMode>)

    setAllProducts(products)
    setProductOffers(offersByProduct)
    setLinkedIds(((linked ?? []) as ProjetoProdutoLink[]).map(r => r.produto_id))
    setOfferModeByProduct(modes)
    setSelectedOfferCodes(offerCodesByProduct)
    setProductSearch('')
    setShowOnlySelected(false)
    setShowProducts(true)
  }

  const saveProducts = async () => {
    setSavingProducts(true)
    await supabase.from('projeto_produto_ofertas').delete().eq('projeto_id', projectId)
    await supabase.from('projeto_produtos').delete().eq('projeto_id', projectId)
    if (linkedIds.length > 0) {
      await supabase
        .from('projeto_produtos')
        .insert(linkedIds.map(pid => ({
          projeto_id: projectId,
          produto_id: pid,
          todas_ofertas: offerModeByProduct[pid] !== 'custom',
        })))

      const offerRows = linkedIds.flatMap(pid => {
        if (offerModeByProduct[pid] !== 'custom') return []
        const selected = new Set(selectedOfferCodes[pid] ?? [])
        return (productOffers[pid] ?? [])
          .filter(offer => selected.has(offer.codigo))
          .map(offer => ({
            projeto_id: projectId,
            produto_id: pid,
            oferta_codigo: offer.codigo,
            oferta_nome: offer.nome,
            oferta_preco: offer.preco,
            oferta_moeda: offer.moeda,
          }))
      })
      if (offerRows.length > 0) {
        await supabase.from('projeto_produto_ofertas').insert(offerRows)
      }
    }
    setSavingProducts(false)
    setShowProducts(false)
    fetchVendas()
  }

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!origensDropdownRef.current?.contains(e.target as Node)) setShowOrigensDropdown(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  useEffect(() => {
    if (!editMode) return
    function handleDocPointerDown(e: PointerEvent) {
      const target = e.target as Element
      if (!target.closest('.dashboard-widget-rgl')) {
        setSelectedWidgetIds(new Set())
      }
    }
    document.addEventListener('pointerdown', handleDocPointerDown)
    return () => document.removeEventListener('pointerdown', handleDocPointerDown)
  }, [editMode])


  useEffect(() => {
    if (!editMode) return
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        setUndoStack(prev => {
          const previous = prev.at(-1)
          if (!previous) return prev
          setRedoStack(stack => [...stack, widgets])
          setWidgets(previous)
          setUndoToast(true)
          if (undoToastTimer.current) clearTimeout(undoToastTimer.current)
          undoToastTimer.current = setTimeout(() => setUndoToast(false), 2000)
          return prev.slice(0, -1)
        })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editMode, widgets])

  const isReady = !loadingWidgets
  const hasUnsavedLayout = !sameLayout(widgets, savedWidgets)
  const displayVendas = useMemo(() => {
    let result = vendas
    if (origensFilter.length > 0) {
      result = result.filter(v => { const o = parseOrigem(v.origem); return o !== null && origensFilter.includes(o) })
    }
    if (afiliadosFilter.length > 0) {
      result = result.filter(v => v.afiliado_nome != null && afiliadosFilter.includes(v.afiliado_nome))
      console.log('[AFILIADO FILTER] selecionados:', afiliadosFilter)
    }
    if (origensFilter.length > 0) {
      console.log('[ORIGEM FILTER] selecionadas:', origensFilter, 'vendas antes:', vendas.length, 'depois:', result.length)
    }
    return result
  }, [vendas, origensFilter, afiliadosFilter])
  const displayCombinedVendas = useMemo(() => {
    let result = combinedVendas
    if (origensFilter.length > 0) result = result.filter(v => { const o = parseOrigem(v.origem); return o !== null && origensFilter.includes(o) })
    if (afiliadosFilter.length > 0) result = result.filter(v => v.afiliado_nome != null && afiliadosFilter.includes(v.afiliado_nome))
    return result
  }, [combinedVendas, origensFilter, afiliadosFilter])
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
    const value = getOfficialSaleAmount(venda)
    return venda.moeda === 'USD'
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
      : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
  }
  const countryRanking = useMemo(() => {
    const groups = new Map<string, { label: string; count: number; revenue: number }>()
    for (const venda of displayVendas.filter(v => v.status === 'approved')) {
      const code = (venda.pais || '').trim().toUpperCase()
      const label = code ? code : 'Unknown'
      const current = groups.get(label) ?? { label, count: 0, revenue: 0 }
      current.count += 1
      current.revenue += getOfficialSaleAmount(venda)
      groups.set(label, current)
    }
    return Array.from(groups.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  }, [displayVendas])
  const insights = useMemo(() => {
    const approved = displayVendas.filter(v => v.status === 'approved')
    const topCountry = countryRanking[0]?.label
    const topProduct = Object.entries(approved.reduce<Record<string, number>>((acc, venda) => {
      const key = venda.produto || 'Produto'
      acc[key] = (acc[key] ?? 0) + getOfficialSaleAmount(venda)
      return acc
    }, {})).sort((a, b) => b[1] - a[1])[0]?.[0]
    return [
      approved.length > 0 ? `${approved.length} vendas aprovadas no período.` : 'Aguardando vendas aprovadas no período.',
      topCountry ? `${topCountry} lidera em receita entre os países.` : 'Mapa de países pronto para novas vendas.',
      topProduct ? `${topProduct} lidera o faturamento.` : 'Produtos aparecerão aqui assim que houver dados.',
    ]
  }, [countryRanking, displayVendas])
  void nowTick
  const filteredProducts = useMemo(() => {
    let list = allProducts
    if (showOnlySelected) list = list.filter(p => linkedIds.includes(p.id))
    const query = productSearch.trim().toLowerCase()
    if (!query) return list
    return list.filter(product =>
      product.nome.toLowerCase().includes(query) ||
      product.hotmart_id.toLowerCase().includes(query),
    )
  }, [allProducts, productSearch, showOnlySelected, linkedIds])
  const selectedOfferCount = useMemo(() => {
    return linkedIds.reduce((count, productId) => {
      if (offerModeByProduct[productId] !== 'custom') return count
      return count + (selectedOfferCodes[productId]?.length ?? 0)
    }, 0)
  }, [linkedIds, offerModeByProduct, selectedOfferCodes])

  const toggleProductSelection = useCallback((productId: string, checked: boolean) => {
    setLinkedIds(prev => checked
      ? Array.from(new Set([...prev, productId]))
      : prev.filter(id => id !== productId))
    if (checked) {
      setOfferModeByProduct(prev => ({ ...prev, [productId]: prev[productId] ?? 'all' }))
      setSelectedOfferCodes(prev => {
        if (prev[productId]) return prev
        return { ...prev, [productId]: (productOffers[productId] ?? []).map(offer => offer.codigo) }
      })
    }
  }, [productOffers])

  const setProductOfferMode = useCallback((productId: string, mode: OfferSelectionMode) => {
    setOfferModeByProduct(prev => ({ ...prev, [productId]: mode }))
    if (mode === 'custom') {
      setSelectedOfferCodes(prev => {
        if (prev[productId]?.length) return prev
        return { ...prev, [productId]: (productOffers[productId] ?? []).map(offer => offer.codigo) }
      })
    }
  }, [productOffers])

  const toggleOfferSelection = useCallback((productId: string, offerCode: string, checked: boolean) => {
    setSelectedOfferCodes(prev => {
      const current = new Set(prev[productId] ?? [])
      if (checked) current.add(offerCode)
      else current.delete(offerCode)
      return { ...prev, [productId]: [...current] }
    })
  }, [])
  return (
    <div className="dashboard-shell min-h-screen text-[var(--dash-text)]" data-dashboard-theme={theme}>
      <header
        className="sticky top-0 z-40 border-b border-[var(--dash-border)] bg-[color:var(--dash-bg)]/88 shadow-lg shadow-black/10 backdrop-blur-sm"
      >
        <div className="mx-auto flex min-h-14 max-w-[1400px] flex-wrap items-center gap-2.5 px-4 py-2 sm:px-6">
          <div className="dashboard-topbar flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl px-2.5 py-1.5 sm:px-3">
            <Link
              href="/"
              title="Página inicial"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-500 text-white shadow-md shadow-cyan-500/15 transition-opacity hover:opacity-80"
            >
              <Rocket size={18} />
            </Link>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--dash-faint)]">
                Dashboard
              </p>
              <h1 className="max-w-[180px] truncate text-base font-extrabold text-[var(--dash-text)] sm:max-w-xs sm:text-lg">
                {projeto?.nome ?? '...'}
              </h1>
            </div>
            {dashboardOptions.length > 0 && (
              <div ref={dashboardSwitcherRef} className="relative">
                <button
                  onClick={() => setShowDashboardSwitcher(prev => !prev)}
                  className="flex min-w-0 items-center gap-2.5 rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)] px-3 py-2 text-left shadow-md shadow-black/10 transition-colors hover:border-[var(--dash-border-strong)] sm:min-w-60"
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
                  <ChevronDown size={18} className={`shrink-0 text-[var(--dash-text)] transition-transform ${showDashboardSwitcher ? 'rotate-180' : ''}`} />
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
                              if (!active) {
                                router.push(`/dashboard/${option.id}`)
                                setSuccessToast('Dashboard alterado')
                                setTimeout(() => setSuccessToast(null), 3000)
                              }
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
        <div className="dashboard-toolbar mb-5 flex flex-col gap-1.5 overflow-visible rounded-xl border border-[var(--dash-border)] bg-[rgba(12,14,24,0.88)] p-1.5 shadow-sm backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 lg:flex-1">
            <PeriodFilter
              value={period}
              onChange={setPeriod}
              customFrom={customFrom}
              customTo={customTo}
              updatedAt={lastUpdatedAt}
              onCustomChange={(from, to) => { setCustomFrom(from); setCustomTo(to) }}
              hasMetaAds={!!linkedMetaAccountId}
              metaCacheUpdatedAt={metaCacheUpdatedAt}
            />
          </div>
          <div className="flex flex-row flex-wrap gap-2 lg:contents">
          {origensDisponiveis.length > 0 && (
            <div ref={origensDropdownRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowOrigensDropdown(v => !v)}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] px-3 text-xs font-medium text-[var(--dash-text)] transition-colors hover:border-[var(--dash-border-strong)]"
              >
                {origensFilter.length === 0
                  ? 'Origem: Todas'
                  : `Origem: ${origensFilter.join(', ')}`}
                <ChevronDown size={13} className={`shrink-0 text-[var(--dash-muted)] transition-transform ${showOrigensDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showOrigensDropdown && (
                <div className="absolute left-0 top-full z-50 mt-2 min-w-[180px] rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)] p-1.5 shadow-2xl shadow-black/40">
                  <button
                    type="button"
                    onClick={() => { setOrigensFilter([]); setShowOrigensDropdown(false) }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--dash-text)] transition-colors hover:bg-white/5"
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${origensFilter.length === 0 ? 'border-cyan-400 bg-cyan-400/20' : 'border-[var(--dash-border)]'}`}>
                      {origensFilter.length === 0 && <Check size={10} className="text-cyan-400" />}
                    </span>
                    Todas
                  </button>
                  {origensDisponiveis.map(origem => {
                    const checked = origensFilter.includes(origem)
                    return (
                      <button
                        key={origem}
                        type="button"
                        onClick={() =>
                          setOrigensFilter(prev =>
                            prev.includes(origem) ? prev.filter(o => o !== origem) : [...prev, origem],
                          )
                        }
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--dash-text)] transition-colors hover:bg-white/5"
                      >
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-cyan-400 bg-cyan-400/20' : 'border-[var(--dash-border)]'}`}>
                          {checked && <Check size={10} className="text-cyan-400" />}
                        </span>
                        {origem}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          {afiliadosDisponiveis.length > 0 && (
            <div ref={afiliadosDropdownRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowAfiliadosDropdown(v => !v)}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] px-3 text-xs font-medium text-[var(--dash-text)] transition-colors hover:border-[var(--dash-border-strong)]"
              >
                {afiliadosFilter.length === 0
                  ? 'Afiliado: Todos'
                  : `Afiliado: ${afiliadosFilter.join(', ')}`}
                <ChevronDown size={13} className={`shrink-0 text-[var(--dash-muted)] transition-transform ${showAfiliadosDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showAfiliadosDropdown && (
                <div className="absolute left-0 top-full z-50 mt-2 min-w-[180px] rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)] p-1.5 shadow-2xl shadow-black/40">
                  <button
                    type="button"
                    onClick={() => { setAfiliadosFilter([]); setShowAfiliadosDropdown(false) }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--dash-text)] transition-colors hover:bg-white/5"
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${afiliadosFilter.length === 0 ? 'border-cyan-400 bg-cyan-400/20' : 'border-[var(--dash-border)]'}`}>
                      {afiliadosFilter.length === 0 && <Check size={10} className="text-cyan-400" />}
                    </span>
                    Todos
                  </button>
                  {afiliadosDisponiveis.map(afiliado => {
                    const checked = afiliadosFilter.includes(afiliado)
                    return (
                      <button
                        key={afiliado}
                        type="button"
                        onClick={() =>
                          setAfiliadosFilter(prev =>
                            prev.includes(afiliado) ? prev.filter(a => a !== afiliado) : [...prev, afiliado],
                          )
                        }
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-[var(--dash-text)] transition-colors hover:bg-white/5"
                      >
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-cyan-400 bg-cyan-400/20' : 'border-[var(--dash-border)]'}`}>
                          {checked && <Check size={10} className="text-cyan-400" />}
                        </span>
                        {afiliado}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          </div>
          <div className="dashboard-action-bar dashboard-panel flex w-full flex-wrap items-center justify-end gap-2 rounded-xl p-1 lg:ml-auto lg:w-auto lg:flex-nowrap">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Atualizar"
              className="flex shrink-0 items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-3 py-1.5 text-sm font-semibold text-white shadow-md shadow-cyan-500/15 transition-colors disabled:opacity-60"
            >
              <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
              {isRefreshing ? 'Atualizando...' : 'Atualizar'}
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
                  onClick={() => setShowClearModal(true)}
                  title="Remover todos os widgets"
                  className="shrink-0 border-red-400/30 bg-red-500/10 text-red-300"
                >
                  <Trash2 size={13} />
                  Limpar tudo
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
          <DashboardGrid
            widgets={widgets}
            isEditing={editMode}
            onLayoutChange={(updated) => setWidgets(updated)}
            onPushHistory={pushHistory}
            vendas={displayVendas}
            previousVendas={previousVendas}
            combinedVendas={displayCombinedVendas}
            period={period}
            exchangeRate={exchangeRate}
            custoTotal={displayCustoTotal}
            customRange={customDateRange}
            loading={false}
            selectedWidgetIds={selectedWidgetIds}
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
            onResize={editMode ? (id, w, h) => {
              pushHistory()
              setWidgets(prev => prev.map(widget => widget.id === id ? { ...widget, col_span: w, row_span: h } : widget))
            } : undefined}
            linkedMetaAccountId={linkedMetaAccountId}
            metaInsights={metaInsights}
            metaAds={metaAds}
            metaCampaigns={metaCampaigns}
          />
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

      {undoToast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#1a1a2e]/95 px-5 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur-sm">
          Ação desfeita
        </div>
      )}

      {isRefreshing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-cyan-400" />
            <p className="text-sm font-medium text-white">Atualizando dados...</p>
          </div>
        </div>
      )}

      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-emerald-500/90 px-4 py-3 text-sm font-medium text-white shadow-lg backdrop-blur-sm">
          <span>✓</span>
          <span>{successToast}</span>
        </div>
      )}

      <Modal
        open={showClearModal}
        onClose={() => setShowClearModal(false)}
        title="Remover todos os widgets"
        maxWidth="max-w-sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--dash-muted)]">
            Isso irá remover permanentemente todos os {widgets.length} widgets do dashboard. Esta ação não pode ser desfeita.
          </p>
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" className="flex-1" onClick={() => setShowClearModal(false)}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={clearAllWidgets}
              style={{ background: 'rgba(239,68,68,0.2)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              <Trash2 size={14} />
              Remover tudo
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showProducts}
        onClose={() => setShowProducts(false)}
        title="Configurar Produtos"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          {/* Header info */}
          <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/3 px-4 py-3">
            <p className="text-xs text-slate-400">
              Somente vendas dos produtos e ofertas selecionadas aparecem no dashboard.
            </p>
            {linkedIds.length > 0 && (
              <span className="ml-3 shrink-0 rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-xs font-bold text-indigo-300">
                {linkedIds.length} produto{linkedIds.length !== 1 ? 's' : ''}
                {selectedOfferCount > 0 ? ` · ${selectedOfferCount} oferta${selectedOfferCount !== 1 ? 's' : ''}` : ''}
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
                onClick={() => {
                  setLinkedIds(allProducts.map(p => p.id))
                  setOfferModeByProduct(Object.fromEntries(allProducts.map(p => [p.id, 'all' as OfferSelectionMode])))
                  setSelectedOfferCodes(Object.fromEntries(allProducts.map(p => [
                    p.id,
                    (productOffers[p.id] ?? []).map(offer => offer.codigo),
                  ])))
                }}
                className="text-xs font-medium text-indigo-400 transition-colors hover:text-indigo-300"
              >
                Selecionar todos os produtos
              </button>
              <span className="text-slate-700">·</span>
              <button
                onClick={() => {
                  setLinkedIds([])
                  setOfferModeByProduct({})
                  setSelectedOfferCodes({})
                }}
                className="text-xs font-medium text-slate-500 transition-colors hover:text-slate-300"
              >
                Limpar seleção
              </button>
              <span className="text-slate-700">·</span>
              <button
                onClick={() => setShowOnlySelected(v => !v)}
                className={`text-xs font-medium transition-colors ${showOnlySelected ? 'text-indigo-300 hover:text-indigo-200' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {showOnlySelected ? 'Ver todos' : 'Ver selecionados'}
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
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {filteredProducts.map(p => {
                const checked = linkedIds.includes(p.id)
                const offers = productOffers[p.id] ?? []
                const mode = offerModeByProduct[p.id] ?? 'all'
                const selectedOffers = selectedOfferCodes[p.id] ?? []
                return (
                  <div
                    key={p.id}
                    className={`rounded-xl border transition-all ${
                      checked
                        ? 'border-indigo-500/30 bg-indigo-500/8'
                        : 'border-transparent bg-white/3 hover:border-white/8 hover:bg-white/5'
                    }`}
                  >
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-3">
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
                      <div className="flex shrink-0 items-center gap-2 text-[11px] text-slate-500">
                        {offers.length > 0 ? (
                          <span>{offers.length} oferta{offers.length !== 1 ? 's' : ''}</span>
                        ) : (
                          <span>Sem ofertas</span>
                        )}
                        <ChevronDown
                          size={14}
                          className={`transition-transform ${checked ? 'rotate-180 text-indigo-300' : 'text-slate-600'}`}
                        />
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => toggleProductSelection(p.id, e.target.checked)}
                        className="sr-only"
                      />
                    </label>

                    {checked && (
                      <div className="border-t border-white/8 px-3 pb-3 pt-2">
                        {offers.length === 0 ? (
                          <p className="rounded-lg bg-black/10 px-3 py-2 text-xs text-slate-500">
                            Nenhuma oferta identificada nas vendas deste produto ainda.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setProductOfferMode(p.id, 'all')}
                                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                  mode === 'all'
                                    ? 'bg-indigo-500 text-white'
                                    : 'bg-white/5 text-slate-400 hover:bg-white/8 hover:text-slate-200'
                                }`}
                              >
                                Todas as ofertas
                              </button>
                              <button
                                type="button"
                                onClick={() => setProductOfferMode(p.id, 'custom')}
                                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                  mode === 'custom'
                                    ? 'bg-indigo-500 text-white'
                                    : 'bg-white/5 text-slate-400 hover:bg-white/8 hover:text-slate-200'
                                }`}
                              >
                                Selecionar ofertas
                              </button>
                              {mode === 'custom' && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedOfferCodes(prev => ({
                                    ...prev,
                                    [p.id]: offers.map(offer => offer.codigo),
                                  }))}
                                  className="text-xs font-medium text-indigo-300 hover:text-indigo-200"
                                >
                                  Marcar todas
                                </button>
                              )}
                            </div>

                            {mode === 'custom' && (
                              <div className="grid gap-1.5 sm:grid-cols-2">
                                {offers.map(offer => {
                                  const offerChecked = selectedOffers.includes(offer.codigo)
                                  const price = formatOfferPrice(offer.preco, offer.moeda)
                                  return (
                                    <label
                                      key={offer.codigo}
                                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                                        offerChecked
                                          ? 'border-indigo-400/30 bg-indigo-400/10'
                                          : 'border-white/8 bg-white/3 hover:bg-white/5'
                                      }`}
                                    >
                                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                                        offerChecked
                                          ? 'border-indigo-400 bg-indigo-500 text-white'
                                          : 'border-white/15 text-transparent'
                                      }`}>
                                        <Check size={12} />
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-xs font-medium text-slate-200">{offer.nome}</span>
                                        {price && <span className="block text-[11px] text-slate-500">{price}</span>}
                                        <span className="block font-mono text-[10px] text-slate-600">{offer.codigo}</span>
                                      </span>
                                      <input
                                        type="checkbox"
                                        checked={offerChecked}
                                        onChange={e => toggleOfferSelection(p.id, offer.codigo, e.target.checked)}
                                        className="sr-only"
                                      />
                                    </label>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
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
