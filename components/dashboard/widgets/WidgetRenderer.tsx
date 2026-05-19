'use client'

import { memo, useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Copy, GripVertical, Pencil, Trash2, X } from 'lucide-react'
import { computeComparableMetric, computeWidgetData, formatPeriodComparisonLabel, getValueFormat } from '@/lib/utils'
import type { WidgetConfig, Venda, Period } from '@/lib/types'
import { MetricWidget } from './MetricWidget'
import { LineChartWidget } from './LineChartWidget'
import { BarChartWidget } from './BarChartWidget'
import { PieWidget } from './PieWidget'
import { CombinedChartWidget } from './CombinedChartWidget'
import { SalesTable } from '@/components/dashboard/SalesTable'
import { MetaMetricWidget } from './meta/MetaMetricWidget'
import { MetaFunnelWidget } from './meta/MetaFunnelWidget'
import { MetaChartWidget } from './meta/MetaChartWidget'
import { MetaCampaignWidget } from './meta/MetaCampaignWidget'
import { MetaCreativeWidget } from './meta/MetaCreativeWidget'
import { computeMetaWidgetData } from '@/lib/meta-ads-mock'

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
  const [expanded, setExpanded] = useState(false)

  const { attributes, listeners, setNodeRef, isDragging } =
    useDraggable({ id: config.id, disabled: !editMode })

  const isMetaWidget = config.type.startsWith('meta-')
  const isChartWidget = config.type === 'line' || config.type === 'bar' || config.type === 'meta-chart'
  const isTimeSeries = config.data_source === 'revenue_by_day' || config.data_source === 'sales_by_day'
  const canExpand = ['line', 'bar', 'pie', 'combined', 'table', 'meta-chart', 'meta-funnel', 'meta-campaign', 'meta-creative'].includes(config.type)
  const effectivePeriod = isChartWidget && isTimeSeries && period !== 'custom' ? chartPeriod : period

  const data = isMetaWidget
    ? computeMetaWidgetData(config.data_source, effectivePeriod)
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

    // Maximum resize bounds: cannot go past the grid's right/bottom edge
    const cardRect = card.getBoundingClientRect()
    const gridRect = grid?.getBoundingClientRect()
    const maxW = gridRect ? gridRect.right - cardRect.left : gridTotalWidth
    const maxH = gridTotalHeight

    function onMouseMove(ev: MouseEvent) {
      const deltaX = ev.clientX - startX
      const deltaY = ev.clientY - startY
      const newW = !affectsLeft && !affectsRight
        ? startW
        : Math.min(maxW, Math.max(110, startW + (affectsLeft ? -deltaX : deltaX)))
      const newH = !affectsTop && !affectsBottom
        ? startH
        : Math.min(maxH, Math.max(90, startH + (affectsTop ? -deltaY : deltaY)))
      setLiveSize({ w: newW, h: newH })
      setResizePct({
        w: Math.round((newW / gridTotalWidth) * 100),
        h: Math.round((newH / gridTotalHeight) * 100),
      })
      onPreviewResize?.(config.id, newW, newH, direction, deltaX, deltaY)
    }

    function onMouseUp(ev: MouseEvent) {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      const deltaX = ev.clientX - startX
      const deltaY = ev.clientY - startY
      const newW = !affectsLeft && !affectsRight
        ? startW
        : Math.min(maxW, Math.max(110, startW + (affectsLeft ? -deltaX : deltaX)))
      const newH = !affectsTop && !affectsBottom
        ? startH
        : Math.min(maxH, Math.max(90, startH + (affectsTop ? -deltaY : deltaY)))
      setLiveSize(null)
      setResizePct(null)
      onCommitResize?.(config.id, newW, newH, direction, deltaX, deltaY)
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

  useEffect(() => {
    if (!expanded) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [expanded])

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
        onClick={(e) => {
          if (canExpand && !editMode && !(e.target as HTMLElement).closest('button,input,a')) setExpanded(true)
        }}
        className={`dashboard-card group relative h-full rounded-2xl transition-all duration-200 ${
          isDragging
            ? 'border-cyan-400/50 shadow-2xl shadow-cyan-500/10'
            : isSelected
              ? 'border-cyan-400/35'
              : 'hover:border-[var(--dash-border-strong)]'
        } ${editMode ? 'cursor-grab active:cursor-grabbing' : canExpand ? 'cursor-zoom-in' : ''}`}
        style={cardStyle}
      >
        {/* Premium selection ring overlay */}
        {isSelected && (
          <div
            className="pointer-events-none absolute inset-0 z-20 rounded-2xl"
            style={{
              border: '2px dashed rgba(34, 211, 238, 0.65)',
              background: 'radial-gradient(ellipse at 50% 0%, rgba(34, 211, 238, 0.04), transparent 65%)',
            }}
          />
        )}

        {/* Resize percentage badge */}
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

        {/* Hotmart widgets */}
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

        {/* Meta Ads widgets */}
        {config.type === 'meta-metric' && data.kind === 'meta-metric' && (
          <MetaMetricWidget title={config.title} data={data} />
        )}
        {config.type === 'meta-funnel' && data.kind === 'meta-funnel' && (
          <MetaFunnelWidget title={config.title} data={data} />
        )}
        {config.type === 'meta-chart' && data.kind === 'meta-chart' && (
          <MetaChartWidget
            title={config.title}
            data={data}
            chartHeight={chartHeight}
            localPeriod={chartPeriod}
            onChangePeriod={setChartPeriod}
          />
        )}
        {config.type === 'meta-campaign' && data.kind === 'meta-campaign' && (
          <MetaCampaignWidget title={config.title} data={data} />
        )}
        {config.type === 'meta-creative' && data.kind === 'meta-creative' && (
          <MetaCreativeWidget title={config.title} data={data} />
        )}
      </div>
      {expanded && !editMode && canExpand && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-3 sm:p-6" onClick={() => setExpanded(false)}>
          <div
            className="dashboard-expanded-modal flex w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-panel-strong)] shadow-2xl"
            style={{ maxHeight: '90vh', height: 'min(90vh, 820px)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--dash-border)] px-5 py-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--dash-faint)]">Analytics expandido</p>
                <h2 className="text-lg font-black text-[var(--dash-text)]">{config.title}</h2>
                <p className="mt-1 text-xs text-[var(--dash-faint)]">Período ativo • comparativo automático</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-bold text-[var(--dash-muted)] hover:text-[var(--dash-text)]">Exportar PNG</button>
                <button className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-bold text-[var(--dash-muted)] hover:text-[var(--dash-text)]">PDF</button>
                <button onClick={() => setExpanded(false)} className="rounded-xl p-2 text-[var(--dash-faint)] hover:bg-white/5 hover:text-[var(--dash-text)]">
                  <X size={19} />
                </button>
              </div>
            </div>
            <div className="grid min-h-0 flex-1 gap-3 overflow-auto p-3 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="min-h-[360px] rounded-2xl border border-white/8 bg-white/[0.025] p-3">
                {config.type === 'line' && data.kind === 'series' && (
                  <LineChartWidget title={config.title} points={data.points} isBRL={isBRL} dualCurrency={data.dualCurrency} chartHeight={480} />
                )}
                {config.type === 'bar' && data.kind === 'series' && (
                  <BarChartWidget title={config.title} points={data.points} isBRL={isBRL} dualCurrency={data.dualCurrency} chartHeight={480} />
                )}
                {config.type === 'pie' && data.kind === 'series' && (
                  <PieWidget title={config.title} points={data.points} chartHeight={480} />
                )}
                {config.type === 'combined' && data.kind === 'combined' && (
                  <CombinedChartWidget title={config.title} vendas={combinedVendas ?? vendas} chartHeight={520} />
                )}
                {config.type === 'table' && data.kind === 'table' && (
                  <SalesTable vendas={data.vendas} exchangeRate={exchangeRate} heightMode="fill" />
                )}
                {config.type === 'meta-chart' && data.kind === 'meta-chart' && (
                  <MetaChartWidget title={config.title} data={data} chartHeight={480} localPeriod={chartPeriod} onChangePeriod={setChartPeriod} />
                )}
                {config.type === 'meta-funnel' && data.kind === 'meta-funnel' && (
                  <MetaFunnelWidget title={config.title} data={data} />
                )}
                {config.type === 'meta-campaign' && data.kind === 'meta-campaign' && (
                  <MetaCampaignWidget title={config.title} data={data} />
                )}
                {config.type === 'meta-creative' && data.kind === 'meta-creative' && (
                  <MetaCreativeWidget title={config.title} data={data} />
                )}
              </div>
              <div className="space-y-3">
                {[
                  ['Comparativo', comparison ?? `vs ${formatPeriodComparisonLabel(period)}`],
                  ['Amostra', `${vendas.length} registros no período`],
                  ['Status', loading ? 'Sincronizando' : 'Atualizado'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.035] p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--dash-faint)]">{label}</p>
                    <p className="mt-2 text-sm font-bold text-[var(--dash-text)]">{value}</p>
                  </div>
                ))}
                <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--dash-faint)]">Insights rápidos</p>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--dash-muted)]">Revise tendências, compare períodos e exporte visões sem sair do layout.</p>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-between border-t border-[var(--dash-border)] px-5 py-2.5 text-xs text-[var(--dash-faint)]">
              <span>ESC fecha • clique fora fecha</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />Atualização ativa</span>
            </div>
          </div>
        </div>,
        document.body,
      )}
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
  prev.isGroupDragging === next.isGroupDragging
)
