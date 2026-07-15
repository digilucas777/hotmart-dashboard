'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  GripVertical,
  Receipt,
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
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import { supabase } from '@/lib/supabase'
import { formatRelativeTime, getPeriodRange, getPreviousPeriodRange, getOfficialSaleAmount, parseOrigem } from '@/lib/utils'
import { fetchVendasSummary, fetchDistinctOrigens, fetchDistinctAfiliados, type SummaryRow } from '@/lib/vendas-aggregation'
import type { Venda, Projeto, Produto, Period, WidgetConfig, WidgetType, WidgetDataSource } from '@/lib/types'
import { PeriodFilter } from '@/components/dashboard/PeriodFilter'
import { AddWidgetModal } from '@/components/dashboard/AddWidgetModal'
import { EditWidgetModal } from '@/components/dashboard/EditWidgetModal'

import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

const GRID_COLUMNS = 12
const LAYOUT_STORAGE_PREFIX = 'dashboard-layout:'
const THEME_STORAGE_KEY = 'dashboard-theme'

// Colunas explícitas evitam buscar campos extras do banco (created_at, updated_at, etc.)
const VENDA_COLUMNS = 'id,hotmart_id,hotmart_produto_id,produto,oferta_codigo,oferta_nome,oferta_descricao,oferta_preco,oferta_moeda,plano_id,plano_nome,comprador_nome,comprador_email,valor,valor_recebido,valor_bruto,taxa_hotmart,comissao_produtor,comissao_coprodutor,comissao_afiliado,valor_operacional_final,moeda,status,data_venda,forma_pagamento,pais,origem,afiliado_nome'

// combinedVendas só alimenta o CombinedChartWidget (computa combined_by_day a partir de
// data_venda/status/moeda/valor_operacional_final) e os filtros de origem/afiliado — não
// precisa dos campos de comprador/oferta completos que VENDA_COLUMNS carrega.
const COMBINED_COLUMNS = 'id,hotmart_produto_id,oferta_codigo,status,moeda,valor_operacional_final,data_venda,origem,afiliado_nome'

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

type CustoManual = {
  id: string
  projeto_id: string
  data: string
  valor: number
  moeda: string
  descricao: string | null
  created_at: string
}

type UserPerms = {
  pode_visualizar: boolean
  pode_editar_layout: boolean
  pode_adicionar_widgets: boolean
  pode_configurar_produtos: boolean
  pode_ver_produtos_ofertas: boolean
  pode_excluir_dashboard: boolean
  pode_ver_vendas: boolean
  pode_adicionar_custo_manual: boolean
  pode_ver_conexao_whatsapp: boolean
  is_admin_dashboard: boolean
  dados_visiveis_a_partir: string | null
} | null

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

// Trava o arrasto da lista de troca de dashboard só no eixo vertical — sem isso, um gesto de
// scroll no mobile (nunca perfeitamente vertical) faz o dnd-kit interpretar um leve
// deslocamento em X como início de um drag, e o item "treme" pros lados ao rolar a lista.
const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 })

function SortableDashboardOption({
  option,
  active,
  onClick,
}: {
  option: Projeto
  active: boolean
  onClick: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: option.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center rounded-2xl"
    >
      <div
        {...attributes}
        {...listeners}
        className="flex shrink-0 cursor-grab touch-none items-center px-2 py-3 text-white active:cursor-grabbing"
        onClick={e => e.stopPropagation()}
      >
        <GripVertical size={16} />
      </div>
      <button
        onClick={onClick}
        className={`flex flex-1 items-center gap-3 rounded-2xl py-3 pr-3 text-left transition-all ${
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
    </div>
  )
}

export function DashboardClient({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [projeto, setProjeto] = useState<Projeto | null>(null)
  const [dashboardOptions, setDashboardOptions] = useState<Projeto[]>([])
  const [showDashboardSwitcher, setShowDashboardSwitcher] = useState(false)
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const [vendas, setVendas] = useState<Venda[]>([])
  // Substituem o antigo array bruto de vendas do período anterior (previousVendas) — só
  // usado pra calcular a variação "vs período anterior" dos widgets de métrica, então um
  // agregado por status/moeda (get_vendas_summary) resolve sem baixar linha por linha.
  const [summaryCurrent, setSummaryCurrent] = useState<SummaryRow[]>([])
  const [summaryPrevious, setSummaryPrevious] = useState<SummaryRow[]>([])
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
  const [loadingProducts, setLoadingProducts] = useState(false)

  const [showClearModal, setShowClearModal] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [successToast, setSuccessToast] = useState<string | null>(null)
  const [errorToast, setErrorToast] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [mobileEditWarning, setMobileEditWarning] = useState(false)

  const [userRole, setUserRole] = useState<string | null>(null)
  const [userPerms, setUserPerms] = useState<UserPerms>(null)
  const [permsLoaded, setPermsLoaded] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const [showDeleteDashboard, setShowDeleteDashboard] = useState(false)
  const [deleteEmailInput, setDeleteEmailInput] = useState('')
  const [deletingDashboard, setDeletingDashboard] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const exportGridRef = useRef<HTMLDivElement>(null)
  // Cache de configuração de produtos — evita 2 queries sequenciais a cada troca de período
  const hotmartCacheRef = useRef<{
    hotmartIds: string[]
    products: { id: string; hotmart_id: string }[]
    productLinks: ProjetoProdutoLink[]
    offerLinks: ProjetoProdutoOfertaLink[]
  } | null>(null)

  const [showCustoModal, setShowCustoModal] = useState(false)
  const [custoManualList, setCustoManualList] = useState<CustoManual[]>([])
  const [custoManualRaw, setCustoManualRaw] = useState<{ valor: number; moeda: string }[]>([])
  const [custoForm, setCustoForm] = useState({ valor: '', moeda: 'USD', data: '', descricao: '' })
  const [savingCusto, setSavingCusto] = useState(false)
  const [deletingCustoId, setDeletingCustoId] = useState<string | null>(null)
  const [custoParaExcluir, setCustoParaExcluir] = useState<CustoManual | null>(null)
  const [custoSalvoOk, setCustoSalvoOk] = useState(false)
  const [custoActionError, setCustoActionError] = useState<string | null>(null)

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
    const toLocalDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const { from, to } = getPeriodRange(period, customDateRange)
    const fromStr = toLocalDate(from)
    const toStr = toLocalDate(new Date(to.getTime() - 1))
    fetch(`/api/exchange-rate?from=${fromStr}&to=${toStr}`)
      .then(r => r.json())
      .then((d: { rate: number }) => setExchangeRate(d.rate ?? 5.85))
      .catch(() => {})
  }, [period, customDateRange])

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
      .order('ordem', { ascending: true })
      .order('data_criacao', { ascending: true })
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
      // Cache hit: pula as 2 queries sequenciais de configuração de produto a cada troca de período
      let config = hotmartCacheRef.current
      if (!config) {
        const { data: pp, error: ppError } = await supabase
          .from('projeto_produtos')
          .select('produto_id, todas_ofertas')
          .eq('projeto_id', projectId)
        if (ppError) throw ppError

        const productLinks = (pp ?? []) as ProjetoProdutoLink[]
        const produtoIds = productLinks.map(r => r.produto_id)

        if (produtoIds.length === 0) {
          setVendas([])
          setSummaryCurrent([])
          setSummaryPrevious([])
          setRecentVendas([])
          setCombinedVendas([])
          return
        }

        // Busca produtos e ofertas em paralelo (eram 2 queries sequenciais)
        const [prodsRes, offersRes] = await Promise.all([
          supabase.from('produtos').select('id, hotmart_id').in('id', produtoIds),
          supabase
            .from('projeto_produto_ofertas')
            .select('produto_id, oferta_codigo, oferta_nome, oferta_preco, oferta_moeda')
            .eq('projeto_id', projectId),
        ])
        if (prodsRes.error) throw prodsRes.error
        if (offersRes.error) throw offersRes.error

        const products = (prodsRes.data ?? []) as { id: string; hotmart_id: string }[]
        const hotmartIds = products.map(r => r.hotmart_id)
        const offerLinks = (offersRes.data ?? []) as ProjetoProdutoOfertaLink[]

        if (hotmartIds.length === 0) {
          setVendas([])
          setSummaryCurrent([])
          setSummaryPrevious([])
          setRecentVendas([])
          setCombinedVendas([])
          return
        }

        config = { hotmartIds, products, productLinks, offerLinks }
        hotmartCacheRef.current = config

        // recentVendas não depende do período — busca apenas na primeira carga e após refresh
        const { data: recentData, error: recentError } = await supabase
          .from('vendas')
          .select(VENDA_COLUMNS)
          .in('hotmart_produto_id', hotmartIds)
          .eq('status', 'approved')
          .order('data_venda', { ascending: false })
          .limit(80)
        if (recentError) throw recentError
        setRecentVendas(
          filterRowsByOfferSelection(
            (recentData ?? []) as Venda[], products, productLinks, offerLinks,
          ).slice(0, 8),
        )
      }

      const { hotmartIds, products, productLinks, offerLinks } = config

      const { from, to } = getPeriodRange(period, customDateRange)
      const previousRange = getPreviousPeriodRange(period, customDateRange)

      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const thirtyDays = new Date(todayStart.getTime() - 29 * 86_400_000)
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const combinedFrom = thirtyDays < monthStart ? thirtyDays : monthStart

      // Busca paginada: PostgREST limita a 1000 rows/req independente do .limit() do cliente.
      const fetchAllForPeriod = async (fromISO: string, toISO: string, columns: string): Promise<Venda[]> => {
        const PAGE_SIZE = 1000
        const all: Venda[] = []
        let offset = 0
        while (true) {
          const { data, error } = await supabase
            .from('vendas')
            .select(columns)
            .in('hotmart_produto_id', hotmartIds)
            .gte('data_venda', fromISO)
            .lt('data_venda', toISO)
            .order('data_venda', { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1)
          // Sem isso, uma página que estoura o statement_timeout (data: null, error setado)
          // era tratada igual a "acabaram as páginas" — o dashboard zerava/mostrava dados
          // parciais em silêncio em vez de cair no catch e mostrar o erro.
          if (error) throw error
          if (!data || data.length === 0) break
          all.push(...(data as unknown as Venda[]))
          if (data.length < PAGE_SIZE) break
          offset += PAGE_SIZE
        }
        return all
      }

      // O período anterior não precisa mais de vendas cruas — só alimentava o cálculo de
      // "vs período anterior" dos widgets de métrica, que agora usa o agregado de
      // get_vendas_summary (poucas linhas, tamanho fixo) em vez de baixar tudo pra somar em JS.
      const [currentData, combinedData, summaryCurrentRows, summaryPreviousRows] = await Promise.all([
        fetchAllForPeriod(from.toISOString(), to.toISOString(), VENDA_COLUMNS),
        fetchAllForPeriod(combinedFrom.toISOString(), new Date(todayStart.getTime() + 86_400_000).toISOString(), COMBINED_COLUMNS),
        fetchVendasSummary(projectId, from, to),
        fetchVendasSummary(projectId, previousRange.from, previousRange.to),
      ])

      const currentFiltered = filterRowsByOfferSelection(currentData, products, productLinks, offerLinks)
      setVendas(currentFiltered)
      setCombinedVendas(filterRowsByOfferSelection(combinedData, products, productLinks, offerLinks))
      setSummaryCurrent(summaryCurrentRows)
      setSummaryPrevious(summaryPreviousRows)
      setLastUpdatedAt(new Date())
    } catch (err) {
      // Sem isso, uma falha aqui (rede, RPC, etc) passava batido: o dashboard ficava com
      // as métricas zeradas (estado inicial) pra sempre, sem nenhum aviso — parecia "produto
      // não vinculado" quando na verdade era um erro silencioso de carregamento.
      console.error('[fetchVendas] falha ao carregar vendas:', err)
      setErrorToast('Não foi possível carregar os dados de vendas. Tente atualizar novamente.')
      setTimeout(() => setErrorToast(null), 8000)
      throw err
    } finally {
      setLoading(false)
    }
  }, [projectId, period, customDateRange, filterRowsByOfferSelection])

  useEffect(() => {
    fetchVendas().catch(() => {
      // Erro já tratado (log + toast) dentro de fetchVendas — aqui só evita um
      // unhandled promise rejection silencioso no carregamento inicial da página.
    })
  }, [fetchVendas])

  const custosRequestIdRef = useRef(0)

  const fetchCustosManuals = useCallback(async () => {
    const requestId = ++custosRequestIdRef.current
    const { from, to } = getPeriodRange(period, customDateRange)
    const toLocalDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const fromDate = toLocalDate(from)
    const toDate = toLocalDate(new Date(to.getTime() - 1))
    const [periodRes, historyRes] = await Promise.all([
      supabase
        .from('custos_manuais')
        .select('valor, moeda')
        .eq('projeto_id', projectId)
        .gte('data', fromDate)
        .lte('data', toDate),
      supabase
        .from('custos_manuais')
        .select('*')
        .eq('projeto_id', projectId)
        .order('data', { ascending: false })
        .limit(10),
    ])
    // Uma resposta atrasada de um período antigo não pode sobrescrever
    // o resultado de um pedido mais novo que já chegou primeiro.
    if (requestId !== custosRequestIdRef.current) return
    setCustoManualRaw((periodRes.data ?? []) as { valor: number; moeda: string }[])
    setCustoManualList((historyRes.data ?? []) as CustoManual[])
  }, [projectId, period, customDateRange])

  useEffect(() => {
    void fetchCustosManuals()
  }, [fetchCustosManuals])

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

    const deadline = Date.now() + 30_000
    for (const row of rows) {
      if (Date.now() > deadline) break
      try {
        const res = await fetch(`/api/hotmart/sync-origem?transaction=${encodeURIComponent(row.hotmart_id)}`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(10_000),
        })
        if (res.ok) {
          const { origem } = await res.json()
          if (origem) {
            await supabase.from('vendas').update({ origem }).eq('id', row.id)
            // Atualiza estado local imediatamente — sem re-fetch completo
            const patch = (v: Venda) => v.id === row.id ? { ...v, origem } : v
            setVendas(prev => prev.map(patch))
            setCombinedVendas(prev => prev.map(patch))
            setRecentVendas(prev => prev.map(patch))
          }
        }
      } catch {
        // ignore individual failures (timeouts, network errors)
      }
      await new Promise(resolve => setTimeout(resolve, 300))
    }
  }, [])

  useEffect(() => {
    void fetchHotmartOrigens()
  }, [fetchHotmartOrigens])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    hotmartCacheRef.current = null  // força re-fetch completo no refresh manual
    try {
      await Promise.all([fetchVendas(), fetchCustosManuals()])
      setSuccessToast('Dados atualizados')
      setTimeout(() => setSuccessToast(null), 5000)
    } catch {
      setErrorToast('Erro ao atualizar — tente novamente')
      setTimeout(() => setErrorToast(null), 8000)
    } finally {
      setIsRefreshing(false)
    }
    // Sincronização de origens em background — não bloqueia a UI
    void fetchHotmartOrigens()
  }, [fetchVendas, fetchCustosManuals, fetchHotmartOrigens])

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

      const origens = await fetchDistinctOrigens(hotmartIds)

      const parsed = Array.from(
        new Set(
          origens
            .map((o: string) => parseOrigem(o))
            .filter(o => o !== '—'),
        ),
      ).sort() as string[]
      setOrigensDisponiveis(parsed)
    }
    void loadOrigens()
  }, [projectId])

  useEffect(() => {
    async function loadAfiliados() {
      const { data: pp } = await supabase
        .from('projeto_produtos')
        .select('produto_id')
        .eq('projeto_id', projectId)
      const produtoIds = (pp ?? []).map((r: { produto_id: string }) => r.produto_id)
      if (produtoIds.length === 0) {
        return
      }

      const { data: prods } = await supabase
        .from('produtos')
        .select('hotmart_id')
        .in('id', produtoIds)
      const hotmartIds = (prods ?? []).map((r: { hotmart_id: string }) => r.hotmart_id)
      if (hotmartIds.length === 0) {
        return
      }

      const afiliados = await fetchDistinctAfiliados(hotmartIds)

      const unique = Array.from(
        new Set(afiliados.filter((v): v is string => !!v && v.trim() !== '')),
      ).sort()
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

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    async function loadPerms() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setCurrentUserId(user.id)
      setCurrentUserEmail(user.email ?? null)
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      const role = (profile as { role?: string } | null)?.role ?? 'user'
      setUserRole(role)

      const logAccess = async () => {
        const { data: projetoRow } = await supabase
          .from('projetos')
          .select('nome')
          .eq('id', projectId)
          .maybeSingle()
        const projetoNome = (projetoRow as { nome?: string } | null)?.nome ?? 'Dashboard'
        void supabase.from('dashboard_access_log').insert({
          user_id: user.id,
          projeto_id: projectId,
          projeto_nome: projetoNome,
        })
      }

      if (role === 'admin') { setPermsLoaded(true); void logAccess(); return }
      const { data: perms } = await supabase
        .from('user_dashboard_permissions')
        .select('*')
        .eq('user_id', user.id)
        .eq('projeto_id', projectId)
        .maybeSingle()
      if (!perms || !(perms as { pode_visualizar: boolean }).pode_visualizar) {
        router.push('/projects')
        return
      }
      setUserPerms(perms as UserPerms)
      setPermsLoaded(true)
      void logAccess()
    }
    void loadPerms()
  }, [projectId, router])

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
  }, [widgets, projectId])

  const updateWidget = useCallback(async (
    id: string,
    updates: { type: WidgetType; data_source: WidgetDataSource; title: string },
  ) => {
    const { error } = await supabase.from('dashboard_widgets').update(updates).eq('id', id)
    if (error) throw new Error(error.message)
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

  const handleDeleteDashboard = useCallback(async () => {
    if (!currentUserId || !projeto?.user_id || projeto.user_id !== currentUserId) return
    setDeletingDashboard(true)
    const { error } = await supabase
      .from('projetos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', projectId)
    setDeletingDashboard(false)
    if (error) {
      setLayoutError('Não foi possível excluir o dashboard: ' + error.message)
      return
    }
    router.push('/projects')
  }, [projectId, router, currentUserId, projeto])

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
        setTimeout(() => setLayoutError(null), 4000)
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
    setLoadingProducts(true)
    setShowProducts(true)
    try {
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
    } finally {
      setLoadingProducts(false)
    }
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
    hotmartCacheRef.current = null  // produtos mudaram — força re-fetch da config
    await fetchVendas()
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

  async function exportarImagem() {
    if (!exportGridRef.current) return
    setIsExporting(true)
    const toolbar = document.querySelector('.dashboard-toolbar') as HTMLElement | null
    const headerEl = document.querySelector('header') as HTMLElement | null
    const asideEl = exportGridRef.current.querySelector('aside') as HTMLElement | null
    if (toolbar) toolbar.style.visibility = 'hidden'
    if (headerEl) headerEl.style.visibility = 'hidden'
    if (asideEl) asideEl.style.display = 'none'
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await (html2canvas as any)(exportGridRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#0f0f1a',
        scrollX: 0,
        scrollY: -window.scrollY,
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight,
      })
      const now = new Date()
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const link = document.createElement('a')
      link.download = `${projeto?.nome ?? 'dashboard'}_${date}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      setSuccessToast('Imagem exportada!')
      setTimeout(() => setSuccessToast(null), 3000)
    } catch (err) {
      console.error('[EXPORT]', err)
    } finally {
      if (toolbar) toolbar.style.visibility = ''
      if (headerEl) headerEl.style.visibility = ''
      if (asideEl) asideEl.style.display = ''
      setIsExporting(false)
    }
  }

  function parseCurrencyInput(value: string): number {
    const cleaned = value.replace(/[^\d.,]/g, '')
    if (cleaned.includes(',')) {
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'))
    }
    return parseFloat(cleaned.replace(/,/g, ''))
  }

  async function saveCusto() {
    const valor = parseCurrencyInput(custoForm.valor)
    if (!custoForm.data || isNaN(valor) || valor <= 0) return
    setSavingCusto(true)
    setCustoActionError(null)
    const { error } = await supabase.from('custos_manuais').insert({
      projeto_id: projectId,
      data: custoForm.data,
      valor,
      moeda: custoForm.moeda,
      descricao: custoForm.descricao.trim() || null,
    })
    setSavingCusto(false)
    if (error) {
      setCustoActionError('Não foi possível salvar o custo. Você pode não ter permissão para isso.')
      return
    }
    setCustoForm({ valor: '', moeda: 'USD', data: '', descricao: '' })
    await fetchCustosManuals()
    setCustoSalvoOk(true)
    setTimeout(() => setCustoSalvoOk(false), 3000)
  }

  async function deleteCusto(id: string) {
    setDeletingCustoId(id)
    setCustoActionError(null)
    // RLS bloqueia silenciosamente sem gerar `error` em deletes sem permissão —
    // por isso é preciso conferir `count` pra saber se alguma linha foi mesmo apagada.
    const { error, count } = await supabase.from('custos_manuais').delete({ count: 'exact' }).eq('id', id)
    setDeletingCustoId(null)
    if (error || !count) {
      setCustoActionError('Não foi possível excluir o custo. Você pode não ter permissão para isso.')
      return
    }
    await fetchCustosManuals()
    setCustoParaExcluir(null)
    setSuccessToast('Custo excluído')
    setTimeout(() => setSuccessToast(null), 3000)
  }

  const handleDashboardDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = dashboardOptions.findIndex(p => p.id === active.id)
    const newIndex = dashboardOptions.findIndex(p => p.id === over.id)
    const reordered = arrayMove(dashboardOptions, oldIndex, newIndex)
    setDashboardOptions(reordered)
    await Promise.all(reordered.map((p, i) => supabase.from('projetos').update({ ordem: i }).eq('id', p.id)))
  }, [dashboardOptions])

  const isReady = !loadingWidgets && permsLoaded
  const hasUnsavedLayout = !sameLayout(widgets, savedWidgets)

  const isAdmin = userRole === 'admin'
  const isOwner = !!projeto?.user_id && !!currentUserId && projeto.user_id === currentUserId
  const canEditLayout = isAdmin || userPerms?.is_admin_dashboard || userPerms?.pode_editar_layout || false
  const canAddCustoManual = isAdmin || userPerms?.is_admin_dashboard || userPerms?.pode_adicionar_custo_manual || false
  const canAddWidgets = isAdmin || userPerms?.is_admin_dashboard || userPerms?.pode_adicionar_widgets || false
  const canConfigureProducts = isAdmin || userPerms?.is_admin_dashboard || userPerms?.pode_configurar_produtos || false
  // Excluir dashboard é irreversível o suficiente (mesmo com soft-delete) pra ficar restrito só ao dono —
  // não basta ser admin ou ter a flag pode_excluir_dashboard.
  const canDeleteDashboard = isOwner
  const displayVendas = useMemo(() => {
    let result = vendas
    if (origensFilter.length > 0) {
      result = result.filter(v => { const o = parseOrigem(v.origem); return o !== null && origensFilter.includes(o) })
    }
    if (afiliadosFilter.length > 0) {
      result = result.filter(v => v.afiliado_nome != null && afiliadosFilter.includes(v.afiliado_nome))
    }
    return result
  }, [vendas, origensFilter, afiliadosFilter])
  const displayCombinedVendas = useMemo(() => {
    let result = combinedVendas
    if (origensFilter.length > 0) result = result.filter(v => { const o = parseOrigem(v.origem); return o !== null && origensFilter.includes(o) })
    if (afiliadosFilter.length > 0) result = result.filter(v => v.afiliado_nome != null && afiliadosFilter.includes(v.afiliado_nome))
    return result
  }, [combinedVendas, origensFilter, afiliadosFilter])
  const custoManualTotal = useMemo(
    () => custoManualRaw.reduce((sum, r) => sum + (r.moeda === 'BRL' ? r.valor : r.valor * exchangeRate), 0),
    [custoManualRaw, exchangeRate],
  )
  const custoManualTotalUSD = useMemo(
    () => custoManualRaw.filter(r => r.moeda === 'USD').reduce((sum, r) => sum + r.valor, 0),
    [custoManualRaw],
  )
  const displayCustoTotal = custoManualTotal
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
      const amount = getOfficialSaleAmount(venda)
      current.revenue += venda.moeda === 'USD' ? amount * exchangeRate : amount
      groups.set(label, current)
    }
    return Array.from(groups.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  }, [displayVendas, exchangeRate])
  const insights = useMemo(() => {
    const approved = displayVendas.filter(v => v.status === 'approved')
    const topCountry = countryRanking[0]?.label
    const topProduct = Object.entries(approved.reduce<Record<string, number>>((acc, venda) => {
      const key = venda.produto || 'Produto'
      const amount = getOfficialSaleAmount(venda)
      acc[key] = (acc[key] ?? 0) + (venda.moeda === 'USD' ? amount * exchangeRate : amount)
      return acc
    }, {})).sort((a, b) => b[1] - a[1])[0]?.[0]
    return [
      approved.length > 0 ? `${approved.length} vendas aprovadas no período.` : 'Aguardando vendas aprovadas no período.',
      topCountry ? `${topCountry} lidera em receita entre os países.` : 'Mapa de países pronto para novas vendas.',
      topProduct ? `${topProduct} lidera o faturamento.` : 'Produtos aparecerão aqui assim que houver dados.',
    ]
  }, [countryRanking, displayVendas, exchangeRate])
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
            {dashboardOptions.length === 0 && (
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--dash-faint)]">
                  Dashboard
                </p>
                <h1 className="max-w-[180px] truncate text-base font-extrabold text-[var(--dash-text)] sm:max-w-xs sm:text-lg">
                  {projeto?.nome ?? '...'}
                </h1>
              </div>
            )}
            {dashboardOptions.length > 0 && (
              <div ref={dashboardSwitcherRef} className="relative min-w-0 flex-1 sm:flex-none">
                <button
                  onClick={() => setShowDashboardSwitcher(prev => !prev)}
                  className="flex w-full min-w-0 items-center gap-2.5 rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)] px-3 py-2 text-left shadow-md shadow-black/10 transition-colors hover:border-[var(--dash-border-strong)] sm:w-auto sm:min-w-60"
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
                  <div className="absolute left-0 top-full z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-[var(--dash-border)] bg-[var(--dash-panel)] p-2 shadow-2xl shadow-black/35 backdrop-blur-2xl">
                    <div className="px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--dash-faint)]">Trocar dashboard</p>
                    </div>
                    <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={isAdmin ? handleDashboardDragEnd : () => {}} modifiers={[restrictToVerticalAxis]}>
                    <SortableContext items={dashboardOptions.map(p => p.id)} strategy={verticalListSortingStrategy}>
                    <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
                      {dashboardOptions.map(option => {
                        const active = option.id === projectId
                        return (
                          <SortableDashboardOption
                            key={option.id}
                            option={option}
                            active={active}
                            onClick={() => {
                              setShowDashboardSwitcher(false)
                              if (!active) {
                                router.push(`/dashboard/${option.id}`)
                                setSuccessToast('Dashboard alterado')
                                setTimeout(() => setSuccessToast(null), 3000)
                              }
                            }}
                          />
                        )
                      })}
                    </div>
                    </SortableContext>
                    </DndContext>
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
        <div className="dashboard-toolbar relative z-20 mb-5 flex flex-col gap-1.5 overflow-visible rounded-xl border border-[var(--dash-border)] bg-[rgba(12,14,24,0.88)] p-1.5 shadow-sm backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 lg:flex-1">
            <PeriodFilter
              value={period}
              onChange={setPeriod}
              customFrom={customFrom}
              customTo={customTo}
              updatedAt={lastUpdatedAt}
              onCustomChange={(from, to) => { setCustomFrom(from); setCustomTo(to) }}
            />
          </div>
          <div className="flex flex-row flex-wrap gap-2 lg:contents">
          {origensDisponiveis.length > 0 && (
            <div ref={origensDropdownRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowOrigensDropdown(v => !v)}
                className="flex min-h-8 max-w-[220px] items-center gap-1.5 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] px-3 py-1.5 text-xs font-medium text-[var(--dash-text)] transition-colors hover:border-[var(--dash-border-strong)]"
              >
                <span className="min-w-0 flex-1 whitespace-normal break-words text-left">
                  {origensFilter.length === 0
                    ? 'Origem: Todas'
                    : `Origem: ${origensFilter.join(', ')}`}
                </span>
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
                        className="flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-[var(--dash-text)] transition-colors hover:bg-white/5"
                      >
                        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-cyan-400 bg-cyan-400/20' : 'border-[var(--dash-border)]'}`}>
                          {checked && <Check size={10} className="text-cyan-400" />}
                        </span>
                        <span className="min-w-0 flex-1 whitespace-normal break-words">{origem}</span>
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
                className="flex min-h-8 max-w-[220px] items-center gap-1.5 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] px-3 py-1.5 text-xs font-medium text-[var(--dash-text)] transition-colors hover:border-[var(--dash-border-strong)]"
              >
                <span className="min-w-0 flex-1 whitespace-normal break-words text-left">
                  {afiliadosFilter.length === 0
                    ? 'Afiliado: Todos'
                    : `Afiliado: ${afiliadosFilter.join(', ')}`}
                </span>
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
                        className="flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-[var(--dash-text)] transition-colors hover:bg-white/5"
                      >
                        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-cyan-400 bg-cyan-400/20' : 'border-[var(--dash-border)]'}`}>
                          {checked && <Check size={10} className="text-cyan-400" />}
                        </span>
                        <span className="min-w-0 flex-1 whitespace-normal break-words">{afiliado}</span>
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
            <button
              onClick={exportarImagem}
              disabled={isExporting || !isReady}
              title="Exportar imagem do dashboard"
              className="flex shrink-0 items-center gap-2 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)] px-3 py-1.5 text-sm font-semibold text-[var(--dash-text)] transition-colors hover:border-[var(--dash-border-strong)] disabled:opacity-60"
            >
              <Camera size={15} />
              Exportar
            </button>
            {!editMode ? (
              canEditLayout && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (isMobile) {
                      setMobileEditWarning(true)
                      setTimeout(() => setMobileEditWarning(false), 3000)
                      return
                    }
                    setEditMode(true)
                    setSelectedWidgetIds(new Set())
                  }}
                  className="shrink-0"
                >
                  <Pencil size={13} />
                  Editar layout
                </Button>
              )
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
                {canAddWidgets && (
                  <Button variant="outline" size="sm" onClick={() => setShowAddWidget(true)} className="shrink-0">
                    <Plus size={13} />
                    Adicionar Widget
                  </Button>
                )}
              </>
            )}
            {!editMode && canConfigureProducts && (
              <Button variant="outline" size="sm" onClick={openProductsModal} className="shrink-0">
                <Settings size={13} />
                Configurar produtos
              </Button>
            )}
            {!editMode && canAddCustoManual && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const today = new Date().toISOString().split('T')[0]!
                  setCustoForm(f => ({ ...f, data: f.data || today }))
                  setShowCustoModal(true)
                }}
                className="shrink-0"
              >
                <Receipt size={13} />
                Inserir custo
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
            {(canEditLayout || canAddWidgets) && (
              <Button onClick={() => {
                setEditMode(true)
                setShowAddWidget(true)
              }}>
                <Plus size={14} />
                Criar primeiro widget
              </Button>
            )}
          </div>
        ) : (
          <div ref={exportGridRef} className="relative">
          <DashboardGrid
            widgets={widgets}
            isEditing={editMode}
            onLayoutChange={(updated) => setWidgets(updated)}
            onPushHistory={pushHistory}
            vendas={displayVendas}
            summaryCurrent={summaryCurrent}
            summaryPrevious={summaryPrevious}
            combinedVendas={displayCombinedVendas}
            period={period}
            exchangeRate={exchangeRate}
            custoTotal={displayCustoTotal}
            custoManualTotal={custoManualTotal}
            custoUSD={custoManualTotalUSD}
            customRange={customDateRange}
            loading={loading}
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
            linkedMetaAccountId={null}
            metaInsights={null}
            metaAds={null}
            metaCampaigns={null}
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
            <div className={`relative max-h-[360px] space-y-1 overflow-y-auto pr-1 transition-opacity duration-300 ${loading ? 'pointer-events-none opacity-35' : ''}`}>
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
              <div className={`space-y-1.5 transition-opacity duration-300 ${loading ? 'pointer-events-none opacity-35' : ''}`}>
                {loading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-8 animate-pulse rounded-lg bg-white/[0.04]" />
                    ))
                  : insights.map((item, index) => (
                      <div key={index} className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-1.5 text-[11px] leading-4 text-[var(--dash-muted)]">
                        {item}
                      </div>
                    ))
                }
              </div>
            </div>
            <div className="mt-3 border-t border-white/[0.06] pt-2.5">
              <h3 className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-[var(--dash-muted)]">Mapa de países</h3>
              <div className={`space-y-1.5 transition-opacity duration-300 ${loading ? 'pointer-events-none opacity-35' : ''}`}>
                {loading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-10 animate-pulse rounded-lg bg-white/[0.04]" />
                    ))
                  : (countryRanking.length ? countryRanking : [{ label: 'Unknown', count: 0, revenue: 0 }]).map((country, index) => (
                      <div key={country.label} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg bg-white/[0.025] px-2 py-1.5">
                        <div>
                          <p className="text-xs font-bold text-[var(--dash-text)]">{country.label === 'Unknown' ? '🌐 Unknown' : `🌐 ${country.label}`}</p>
                          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/5">
                            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400" style={{ width: `${Math.max(8, 100 - index * 18)}%` }} />
                          </div>
                        </div>
                        <p className="text-[10px] font-bold text-[var(--dash-faint)]">{country.count} vendas</p>
                      </div>
                    ))
                }
              </div>
            </div>
          </aside>
          </div>
        )}
      </main>

      {/* Zona de risco: de propósito longe do resto da toolbar (não deve ficar ao lado
          de ações rotineiras como "Inserir custo") — só o dono do dashboard vê isso. */}
      {!editMode && canDeleteDashboard && (
        <div className="mx-auto mb-10 mt-16 max-w-[1400px] px-6">
          <div className="rounded-xl border border-red-500/20 px-4 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-red-400/70">
              Zona de risco
            </p>
            <button
              onClick={() => setShowDeleteDashboard(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-red-400/80 transition-colors hover:text-red-300"
            >
              <Trash2 size={12} />
              Excluir este dashboard
            </button>
          </div>
        </div>
      )}

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

      {isExporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-violet-400" />
            <p className="text-sm font-medium text-white">Gerando imagem...</p>
          </div>
        </div>
      )}

      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-emerald-500/90 px-4 py-3 text-sm font-medium text-white shadow-lg backdrop-blur-sm">
          <span>✓</span>
          <span>{successToast}</span>
        </div>
      )}

      {errorToast && (
        <div className="fixed inset-x-4 top-1/2 z-[60] flex -translate-y-1/2 justify-center">
          <div className="flex max-w-md items-start gap-3 rounded-2xl border border-red-400/40 bg-red-600 px-5 py-4 text-sm font-semibold text-white shadow-2xl shadow-red-900/40">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <span>{errorToast}</span>
            <button onClick={() => setErrorToast(null)} className="ml-1 shrink-0 opacity-80 hover:opacity-100">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {mobileEditWarning && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-amber-500/90 px-4 py-3 text-sm font-medium text-white shadow-lg backdrop-blur-sm">
          <span>⚠</span>
          <span>Edição disponível apenas no desktop</span>
        </div>
      )}

      {layoutError && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-rose-500/90 px-4 py-3 text-sm font-medium text-white shadow-lg backdrop-blur-sm">
          <span>⚠</span>
          <span>{layoutError}</span>
        </div>
      )}

      <Modal
        open={showCustoModal}
        onClose={() => { setShowCustoModal(false); setCustoSalvoOk(false) }}
        title="Inserir custo manual"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          {/* Form */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--dash-muted)]">Valor *</label>
              <input
                type="text"
                inputMode="decimal"
                value={custoForm.valor}
                onChange={e => setCustoForm(f => ({ ...f, valor: e.target.value }))}
                placeholder="0,00 ou 1.884,79"
                className="h-9 w-full rounded-lg border border-white/10 bg-[#121221] px-3 text-sm text-slate-200 outline-none focus:border-indigo-500/60"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--dash-muted)]">Moeda</label>
              <select
                value={custoForm.moeda}
                onChange={e => setCustoForm(f => ({ ...f, moeda: e.target.value }))}
                className="h-9 w-full rounded-lg border border-white/10 bg-[#121221] px-3 text-sm text-slate-200 outline-none focus:border-indigo-500/60"
              >
                <option value="USD">USD</option>
                <option value="BRL">BRL</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--dash-muted)]">Data *</label>
            <input
              type="date"
              value={custoForm.data}
              onChange={e => setCustoForm(f => ({ ...f, data: e.target.value }))}
              className="h-9 w-full rounded-lg border border-white/10 bg-[#121221] px-3 text-sm text-slate-200 outline-none focus:border-indigo-500/60"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--dash-muted)]">Descrição (opcional)</label>
            <input
              type="text"
              value={custoForm.descricao}
              onChange={e => setCustoForm(f => ({ ...f, descricao: e.target.value }))}
              placeholder="Ex: Tráfego pago, ferramenta, influencer..."
              className="h-9 w-full rounded-lg border border-white/10 bg-[#121221] px-3 text-sm text-slate-200 outline-none focus:border-indigo-500/60"
            />
          </div>
          {custoSalvoOk && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-400">
              <span>✓</span>
              <span>Custo adicionado</span>
            </div>
          )}
          {custoActionError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/15 px-3 py-2 text-sm font-medium text-red-300">
              <span>⚠</span>
              <span>{custoActionError}</span>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" className="flex-1" onClick={() => { setShowCustoModal(false); setCustoSalvoOk(false); setCustoActionError(null) }}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={saveCusto}
              disabled={savingCusto || !custoForm.data || !custoForm.valor}
            >
              {savingCusto && <Spinner size={13} />}
              Salvar custo
            </Button>
          </div>

          {/* Histórico */}
          {custoManualList.length > 0 && (
            <div className="border-t border-white/[0.06] pt-4">
              <p className="mb-2 text-xs font-black uppercase tracking-wider text-[var(--dash-muted)]">Últimos 10 custos</p>
              <div className="max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[var(--dash-faint)]">
                      <th className="pb-1.5 font-semibold">Data</th>
                      <th className="pb-1.5 font-semibold">Valor</th>
                      <th className="pb-1.5 font-semibold">Descrição</th>
                      <th className="pb-1.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {custoManualList.map(c => (
                      <tr key={c.id}>
                        <td className="py-1.5 pr-2 text-slate-300">{c.data}</td>
                        <td className="py-1.5 pr-2 font-semibold text-slate-200">
                          {c.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} {c.moeda}
                        </td>
                        <td className="py-1.5 pr-2 text-slate-400">{c.descricao ?? '—'}</td>
                        <td className="py-1.5 text-right">
                          <button
                            onClick={() => { setCustoActionError(null); setCustoParaExcluir(c) }}
                            disabled={deletingCustoId === c.id}
                            className="text-slate-600 hover:text-red-400 disabled:opacity-40 transition-colors"
                          >
                            {deletingCustoId === c.id ? <Spinner size={11} /> : <Trash2 size={11} />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={!!custoParaExcluir}
        onClose={() => { setCustoParaExcluir(null); setCustoActionError(null) }}
        title="Excluir custo"
        maxWidth="max-w-sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--dash-muted)]">
            {custoParaExcluir && (
              <>
                Tem certeza que deseja excluir o custo de{' '}
                <span className="font-semibold text-slate-200">
                  {custoParaExcluir.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} {custoParaExcluir.moeda}
                </span>{' '}
                ({custoParaExcluir.data})? Esta ação não pode ser desfeita.
              </>
            )}
          </p>
          {custoActionError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/15 px-3 py-2 text-sm font-medium text-red-300">
              <span>⚠</span>
              <span>{custoActionError}</span>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" className="flex-1" onClick={() => { setCustoParaExcluir(null); setCustoActionError(null) }}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={() => custoParaExcluir && void deleteCusto(custoParaExcluir.id)}
              disabled={!!deletingCustoId}
              style={{ background: 'rgba(239,68,68,0.2)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              {deletingCustoId ? <Spinner size={13} /> : <Trash2 size={14} />}
              Excluir
            </Button>
          </div>
        </div>
      </Modal>

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
        open={showDeleteDashboard}
        onClose={() => { setShowDeleteDashboard(false); setDeleteEmailInput('') }}
        title="Excluir dashboard"
        maxWidth="max-w-sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--dash-muted)]">
            O dashboard &ldquo;{projeto?.nome}&rdquo; vai pra lixeira e some da sua lista agora, mas
            só é apagado <strong>de vez depois de 10 dias</strong> — nesse período dá pra restaurar
            em <em>Projetos → Lixeira</em>. Passado esse prazo, não tem mais volta.
          </p>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--dash-muted)]">
              Digite seu e-mail (<span className="font-mono">{currentUserEmail}</span>) pra confirmar
            </label>
            <input
              type="email"
              autoFocus
              value={deleteEmailInput}
              onChange={e => setDeleteEmailInput(e.target.value)}
              placeholder={currentUserEmail ?? ''}
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none ring-1 ring-white/10 focus:ring-red-500/60"
              style={{ background: 'var(--dash-input-bg, #111120)', color: 'var(--dash-text, #e2e8f0)' }}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" className="flex-1" onClick={() => { setShowDeleteDashboard(false); setDeleteEmailInput('') }}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={handleDeleteDashboard}
              disabled={
                deletingDashboard ||
                !currentUserEmail ||
                deleteEmailInput.trim().toLowerCase() !== currentUserEmail.toLowerCase()
              }
              style={{ background: 'rgba(239,68,68,0.2)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              <Trash2 size={14} />
              {deletingDashboard ? 'Excluindo...' : 'Excluir'}
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
        {loadingProducts ? (
          <div className="flex flex-col items-center gap-4 py-12">
            <Spinner size={28} />
            <p className="text-sm text-slate-400">Carregando produtos...</p>
          </div>
        ) : (
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
        )}
      </Modal>
    </div>
  )
}
