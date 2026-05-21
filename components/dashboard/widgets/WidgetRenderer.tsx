'use client'

import { memo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Copy, GripVertical, Pencil, Trash2 } from 'lucide-react'
import { computeComparableMetric, computeWidgetData, formatPeriodComparisonLabel, getValueFormat } from '@/lib/utils'
import type { Period, Venda, WidgetConfig } from '@/lib/types'
import { SalesTable } from '@/components/dashboard/SalesTable'
import { computeMetaWidgetData } from '@/lib/meta-ads-mock'
import { BarChartWidget } from './BarChartWidget'
import { CombinedChartWidget } from './CombinedChartWidget'
import { LineChartWidget } from './LineChartWidget'
import { MetricWidget } from './MetricWidget'
import { PieWidget } from './PieWidget'
import { MetaCampaignWidget } from './meta/MetaCampaignWidget'
import { MetaChartWidget } from './meta/MetaChartWidget'
import { MetaCreativeWidget } from './meta/MetaCreativeWidget'
import { MetaFunnelWidget } from './meta/MetaFunnelWidget'
import { MetaMetricWidget } from './meta/MetaMetricWidget'

const GRID_ROW_HEIGHT = 20
const GRID_ITEM_PADDING = 10

export type ResizeDirection =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

type MetaInsightsRaw = Record<string, unknown>

type InsightsValue = { value: number; valueUsd?: number }

function getInsightsValue(source: string, ins: MetaInsightsRaw): InsightsValue | null {
  const num = (k: string) => parseFloat(String(ins[k] ?? '0')) || 0
  const int = (k: string) => parseInt(String(ins[k] ?? '0'), 10) || 0

  switch (source) {
    case 'meta_spend':               return { value: num('spend_brl'),  valueUsd: num('spend_usd') }
    case 'meta_cpm':                 return { value: num('cpm_brl'),    valueUsd: num('cpm_usd') }
    case 'meta_cpc':                 return { value: num('cpc_brl'),    valueUsd: num('cpc_usd') }
    case 'meta_cpl':                 return { value: num('cpl_brl'),    valueUsd: num('cpl_usd') }
    case 'meta_cpa':                 return { value: num('cpa_brl'),    valueUsd: num('cpa_usd') }
    case 'meta_impressions':         return { value: int('impressions') }
    case 'meta_reach':               return { value: int('reach') }
    case 'meta_link_clicks':         return { value: int('clicks') }
    case 'meta_ctr':                 return { value: num('ctr') }
    case 'meta_frequency':           return { value: num('frequency') }
    case 'meta_leads':               return { value: num('leads') }
    case 'meta_purchases':           return { value: num('purchases') }
    case 'meta_conversions':         return { value: num('conversions') }
    case 'meta_checkout_initiated':  return { value: num('checkouts') }
    case 'meta_add_to_cart':         return { value: num('add_to_cart') }
    case 'meta_page_views':          return { value: num('page_views') }
    default:                         return null
  }
}

function WidgetRendererBase({
  config,
  vendas,
  previousVendas,
  combinedVendas,
  period,
  exchangeRate,
  custoTotal = 0,
  customRange,
  editMode,
  loading,
  selected,
  isGroupDragging = false,
  linkedMetaAccountId,
  metaInsights,
  onSelect,
  onDelete,
  onDuplicate,
  onEdit,
  onPreviewResize,
  onCommitResize,
}: {
  config: WidgetConfig
  vendas: Venda[]
  previousVendas?: Venda[]
  combinedVendas?: Venda[]
  period: Period
  exchangeRate: number
  custoTotal?: number
  customRange?: { from: Date; to: Date }
  editMode: boolean
  loading?: boolean
  selected: boolean
  linkedMetaAccountId?: string | null
  metaInsights?: MetaInsightsRaw | null
  onSelect: (id: string, multi?: boolean) => void
  onDelete: (id: string) => void
  onDuplicate?: (id: string) => void
  onEdit?: (id: string) => void
  isGroupDragging?: boolean
  onPreviewResize?: (id: string, width: number, height: number, direction: ResizeDirection, deltaX: number, deltaY: number) => void
  onCommitResize?: (id: string, width: number, height: number, direction: ResizeDirection, deltaX: number, deltaY: number) => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [liveSize, setLiveSize] = useState<{ w: number; h: number } | null>(null)
  const [resizePct, setResizePct] = useState<{ w: number; h: number } | null>(null)
  const [chartPeriod, setChartPeriod] = useState<Period>(period)

  const { attributes, listeners, setNodeRef, isDragging } =
    useDraggable({ id: config.id, disabled: !editMode })

  const isMetaWidget = config.type.startsWith('meta-')
  const isChartWidget = config.type === 'line' || config.type === 'bar' || config.type === 'meta-chart'
  const isTimeSeries = config.data_source === 'revenue_by_day' || config.data_source === 'sales_by_day'
  const isProductChart = config.data_source === 'revenue_by_product' || config.data_source === 'count_by_product'
  const effectivePeriod = isChartWidget && isTimeSeries && period !== 'custom' ? chartPeriod : period

  const isMetaLinked = !!linkedMetaAccountId

  const data = isMetaWidget
    ? (() => {
        const mock = computeMetaWidgetData(config.data_source, effectivePeriod)
        if (isMetaLinked && metaInsights && mock.kind === 'meta-metric') {
          const real = getInsightsValue(config.data_source, metaInsights)
          if (real !== null) return { ...mock, value: real.value, valueUsd: real.valueUsd, change: 0 }
        }
        return mock
      })()
    : computeWidgetData(vendas, config.data_source, effectivePeriod, exchangeRate, custoTotal, customRange)

  const isBRL = !isMetaWidget && getValueFormat(config.data_source) === 'brl'
  const comparison = !isMetaWidget && data.kind === 'metric' && previousVendas
    ? (() => {
        const current = computeComparableMetric(vendas, config.data_source, exchangeRate, custoTotal)
        const previous = computeComparableMetric(previousVendas, config.data_source, exchangeRate, custoTotal)
        if (current === null || previous === null || previous === 0) return null
        const pct = ((current - previous) / Math.abs(previous)) * 100
        if (Math.abs(pct) < 0.1) return `• 0% vs ${formatPeriodComparisonLabel(period)}`
        return `${pct > 0 ? '↑' : '↓'} ${pct > 0 ? '+' : ''}${pct.toFixed(0)}% vs ${formatPeriodComparisonLabel(period)}`
      })()
    : null

  const chartHeight = liveSize
    ? Math.max(120, liveSize.h - 80)
    : Math.max(120, (config.row_span ?? 12) * GRID_ROW_HEIGHT - GRID_ITEM_PADDING * 2 - 80)

  const cardHeightStyle: CSSProperties = liveSize
    ? { height: `${liveSize.h}px` }
    : { height: '100%' }

  const resizeZones: { direction: ResizeDirection; className: string; title: string }[] = [
    { direction: 'top', title: 'Redimensionar pelo topo', className: 'inset-x-7 top-0 h-3 cursor-ns-resize' },
    { direction: 'bottom', title: 'Redimensionar por baixo', className: 'inset-x-7 bottom-0 h-3 cursor-ns-resize' },
    { direction: 'left', title: 'Redimensionar pela esquerda', className: 'left-0 inset-y-7 w-3 cursor-ew-resize' },
    { direction: 'right', title: 'Redimensionar pela direita', className: 'right-0 inset-y-7 w-3 cursor-ew-resize' },
    { direction: 'top-left', title: 'Redimensionar pelo canto superior esquerdo', className: 'left-0 top-0 h-7 w-7 cursor-nwse-resize' },
    { direction: 'top-right', title: 'Redimensionar pelo canto superior direito', className: 'right-0 top-0 h-7 w-7 cursor-nesw-resize' },
    { direction: 'bottom-left', title: 'Redimensionar pelo canto inferior esquerdo', className: 'bottom-0 left-0 h-7 w-7 cursor-nesw-resize' },
    { direction: 'bottom-right', title: 'Redimensionar pelo canto inferior direito', className: 'bottom-0 right-0 h-7 w-7 cursor-nwse-resize' },
  ]

  function handleResizeStart(e: ReactMouseEvent, direction: ResizeDirection) {
    e.preventDefault()
    e.stopPropagation()
    const card = cardRef.current
    if (!card) return

    const grid = card.closest('.dashboard-grid') as HTMLElement | null
    const gridTotalWidth = grid?.clientWidth ?? 1200
    const gridTotalHeight = Math.max(600, grid?.scrollHeight ?? 800)
    const startX = e.clientX
    const startY = e.clientY
    const startW = card.offsetWidth
    const startH = card.offsetHeight
    const affectsLeft = direction.includes('left')
    const affectsRight = direction.includes('right')
    const affectsTop = direction.includes('top')
    const affectsBottom = direction.includes('bottom')
    const cardRect = card.getBoundingClientRect()
    const gridRect = grid?.getBoundingClientRect()
    const maxW = gridRect ? gridRect.right - cardRect.left : gridTotalWidth
    const maxH = gridTotalHeight

    function getSize(ev: MouseEvent) {
      const deltaX = ev.clientX - startX
      const deltaY = ev.clientY - startY
      const width = !affectsLeft && !affectsRight
        ? startW
        : Math.min(maxW, Math.max(110, startW + (affectsLeft ? -deltaX : deltaX)))
      const height = !affectsTop && !affectsBottom
        ? startH
        : Math.min(maxH, Math.max(90, startH + (affectsTop ? -deltaY : deltaY)))
      return { width, height, deltaX, deltaY }
    }

    function onMouseMove(ev: MouseEvent) {
      const next = getSize(ev)
      setLiveSize({ w: next.width, h: next.height })
      setResizePct({
        w: Math.round((next.width / gridTotalWidth) * 100),
        h: Math.round((next.height / gridTotalHeight) * 100),
      })
      onPreviewResize?.(config.id, next.width, next.height, direction, next.deltaX, next.deltaY)
    }

    function onMouseUp(ev: MouseEvent) {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      const next = getSize(ev)
      setLiveSize(null)
      setResizePct(null)
      onCommitResize?.(config.id, next.width, next.height, direction, next.deltaX, next.deltaY)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const shellStyle: CSSProperties = {
    gridColumn: `${config.col_start ?? 1} / span ${config.col_span ?? 6}`,
    gridRow: `${config.row_start ?? 1} / span ${config.row_span ?? 12}`,
    opacity: isDragging ? 0.15 : isGroupDragging ? 0.45 : 1,
    padding: GRID_ITEM_PADDING,
    '--mobile-row-span': String(Math.max(12, Math.min(26, config.row_span ?? 12))),
  } as CSSProperties

  const isSelected = selected && editMode && !isDragging
  const cardStyle: CSSProperties = {
    ...cardHeightStyle,
    overflow: 'hidden',
    ...(isSelected ? {
      boxShadow: '0 0 0 2px rgba(34, 211, 238, 0.55), 0 0 28px rgba(34, 211, 238, 0.22), 0 0 60px rgba(34, 211, 238, 0.08)',
    } : {}),
  }

  return (
    <div
      ref={setNodeRef}
      onPointerDown={(e) => {
        if (editMode) onSelect(config.id, e.shiftKey)
      }}
      style={shellStyle}
      className={`dashboard-widget-shell ${isSelected ? 'relative z-10' : ''}`}
    >
      <div
        ref={cardRef}
        {...(editMode ? attributes : {})}
        {...(editMode ? listeners : {})}
        className={`dashboard-card group relative h-full rounded-2xl transition-all duration-200 ${
          isDragging
            ? 'border-cyan-400/50 shadow-2xl shadow-cyan-500/10'
            : isSelected
              ? 'border-cyan-400/35'
              : 'hover:border-[var(--dash-border-strong)]'
        } ${editMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={cardStyle}
      >
        {isSelected && (
          <div
            className="pointer-events-none absolute inset-0 z-20 rounded-2xl"
            style={{
              border: '2px dashed rgba(34, 211, 238, 0.65)',
              background: 'radial-gradient(ellipse at 50% 0%, rgba(34, 211, 238, 0.04), transparent 65%)',
            }}
          />
        )}

        {liveSize && resizePct && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
            <div
              className="rounded-xl px-4 py-2 font-mono text-sm font-bold text-cyan-300"
              style={{
                background: 'rgba(9, 9, 20, 0.92)',
                border: '1px solid rgba(34, 211, 238, 0.35)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 0 16px rgba(34, 211, 238, 0.12)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <span className="block">Largura {resizePct.w}%</span>
              <span className="block">Altura {resizePct.h}%</span>
            </div>
          </div>
        )}

        {editMode && (
          <>
            <div
              className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-cyan-400/10 to-transparent transition-opacity ${
                isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            />
            <div
              className={`absolute right-3 top-3 z-30 flex items-center gap-1 transition-opacity ${
                isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
              onPointerDown={e => e.stopPropagation()}
            >
              {onEdit && (
                <button
                  onClick={e => {
                    e.stopPropagation()
                    onEdit(config.id)
                  }}
                  title="Editar widget"
                  className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-white/5 hover:text-slate-400"
                >
                  <Pencil size={13} />
                </button>
              )}
              {onDuplicate && (
                <button
                  onClick={e => {
                    e.stopPropagation()
                    onDuplicate(config.id)
                  }}
                  title="Duplicar widget"
                  className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-white/5 hover:text-slate-400"
                >
                  <Copy size={13} />
                </button>
              )}
              <button
                onClick={e => {
                  e.stopPropagation()
                  onDelete(config.id)
                }}
                title="Remover widget"
                className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 size={13} />
              </button>
              <button
                title="Arrastar"
                className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-white/5 hover:text-slate-400"
              >
                <GripVertical size={13} />
              </button>
            </div>

            {resizeZones.map(zone => (
              <div
                key={zone.direction}
                onPointerDown={e => e.stopPropagation()}
                onMouseDown={e => handleResizeStart(e, zone.direction)}
                title={zone.title}
                className={`absolute z-20 rounded-xl transition-colors hover:bg-cyan-300/[0.06] ${zone.className}`}
              />
            ))}
          </>
        )}

        {loading && (
          <div className="pointer-events-none absolute inset-x-4 top-3 z-40 h-0.5 overflow-hidden rounded-full bg-white/5">
            <div className="h-full w-1/3 rounded-full bg-cyan-300/70" />
          </div>
        )}

        {config.type === 'metric' && data.kind === 'metric' && (
          <MetricWidget
            title={config.title}
            value={data.value}
            subValue={data.subValue}
            dataSource={config.data_source}
            comparison={comparison}
          />
        )}
        {config.type === 'line' && data.kind === 'series' && (
          <LineChartWidget
            title={config.title}
            points={data.points}
            isBRL={isBRL}
            dualCurrency={data.dualCurrency}
            chartHeight={chartHeight}
            localPeriod={isTimeSeries ? chartPeriod : undefined}
            onChangePeriod={isTimeSeries ? setChartPeriod : undefined}
          />
        )}
        {config.type === 'bar' && data.kind === 'series' && (
          <BarChartWidget
            title={config.title}
            points={data.points}
            isBRL={isBRL}
            dualCurrency={data.dualCurrency}
            chartHeight={chartHeight}
            localPeriod={isTimeSeries ? chartPeriod : undefined}
            onChangePeriod={isTimeSeries ? setChartPeriod : undefined}
            rotateLabels={isProductChart}
          />
        )}
        {config.type === 'pie' && data.kind === 'series' && (
          <PieWidget title={config.title} points={data.points} chartHeight={chartHeight} />
        )}
        {config.type === 'combined' && data.kind === 'combined' && (
          <CombinedChartWidget
            title={config.title}
            vendas={combinedVendas ?? vendas}
            chartHeight={chartHeight}
          />
        )}
        {config.type === 'table' && data.kind === 'table' && (
          <SalesTable vendas={data.vendas} exchangeRate={exchangeRate} heightMode="fill" />
        )}
        {config.type === 'meta-metric' && data.kind === 'meta-metric' && (
          <MetaMetricWidget title={config.title} data={data} isDemo={!isMetaLinked} />
        )}
        {config.type === 'meta-funnel' && data.kind === 'meta-funnel' && (
          <MetaFunnelWidget title={config.title} data={data} isDemo={!isMetaLinked} />
        )}
        {config.type === 'meta-chart' && data.kind === 'meta-chart' && (
          <MetaChartWidget
            title={config.title}
            data={data}
            chartHeight={chartHeight}
            localPeriod={chartPeriod}
            onChangePeriod={setChartPeriod}
            isDemo={!isMetaLinked}
          />
        )}
        {config.type === 'meta-campaign' && data.kind === 'meta-campaign' && (
          <MetaCampaignWidget title={config.title} data={data} isDemo={!isMetaLinked} />
        )}
        {config.type === 'meta-creative' && data.kind === 'meta-creative' && (
          <MetaCreativeWidget title={config.title} data={data} isDemo={!isMetaLinked} />
        )}
      </div>
    </div>
  )
}

export const WidgetRenderer = memo(WidgetRendererBase, (prev, next) =>
  prev.config === next.config &&
  prev.vendas === next.vendas &&
  prev.previousVendas === next.previousVendas &&
  prev.combinedVendas === next.combinedVendas &&
  prev.period === next.period &&
  prev.exchangeRate === next.exchangeRate &&
  prev.custoTotal === next.custoTotal &&
  prev.customRange === next.customRange &&
  prev.editMode === next.editMode &&
  prev.loading === next.loading &&
  prev.selected === next.selected &&
  prev.isGroupDragging === next.isGroupDragging &&
  prev.linkedMetaAccountId === next.linkedMetaAccountId &&
  prev.metaInsights === next.metaInsights
)
