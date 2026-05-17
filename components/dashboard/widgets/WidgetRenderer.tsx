'use client'

import { useState, useRef } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { GripVertical, Trash2 } from 'lucide-react'
import { computeWidgetData, getValueFormat } from '@/lib/utils'
import type { WidgetConfig, Venda, Period } from '@/lib/types'
import { MetricWidget } from './MetricWidget'
import { LineChartWidget } from './LineChartWidget'
import { BarChartWidget } from './BarChartWidget'
import { PieWidget } from './PieWidget'
import { CombinedChartWidget } from './CombinedChartWidget'
import { SalesTable } from '@/components/dashboard/SalesTable'

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

export function WidgetRenderer({
  config,
  vendas,
  combinedVendas,
  period,
  exchangeRate,
  custoTotal = 0,
  editMode,
  selected,
  onSelect,
  onDelete,
  onPreviewResize,
  onCommitResize,
}: {
  config: WidgetConfig
  vendas: Venda[]
  combinedVendas?: Venda[]
  period: Period
  exchangeRate: number
  custoTotal?: number
  editMode: boolean
  selected: boolean
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onPreviewResize?: (id: string, width: number, height: number, direction: ResizeDirection, deltaX: number, deltaY: number) => void
  onCommitResize?: (id: string, width: number, height: number, direction: ResizeDirection, deltaX: number, deltaY: number) => void
}) {
  // ref on the inner card to measure real dimensions for resize
  const cardRef = useRef<HTMLDivElement>(null)
  const [liveSize, setLiveSize] = useState<{ w: number; h: number } | null>(null)

  const { attributes, listeners, setNodeRef, isDragging } =
    useDraggable({ id: config.id, disabled: !editMode })

  const data = computeWidgetData(vendas, config.data_source, period, exchangeRate, custoTotal)
  const isBRL = getValueFormat(config.data_source) === 'brl'

  const chartHeight = liveSize
    ? Math.max(120, liveSize.h - 80)
    : Math.max(120, (config.row_span ?? 12) * GRID_ROW_HEIGHT - GRID_ITEM_PADDING * 2 - 80)

  // Height applied directly on the inner card so h-full works correctly
  const cardHeightStyle: CSSProperties = liveSize
    ? { height: `${liveSize.h}px`, overflow: 'hidden' }
    : { height: '100%', overflow: 'hidden' }

  function handleResizeStart(e: ReactMouseEvent, direction: ResizeDirection) {
    e.preventDefault()
    e.stopPropagation()
    const card = cardRef.current
    if (!card) return

    const startX = e.clientX
    const startY = e.clientY
    const startW = card.offsetWidth
    const startH = card.offsetHeight

    const affectsLeft = direction.includes('left')
    const affectsRight = direction.includes('right')
    const affectsTop = direction.includes('top')
    const affectsBottom = direction.includes('bottom')

    function onMouseMove(ev: MouseEvent) {
      const deltaX = ev.clientX - startX
      const deltaY = ev.clientY - startY
      const newW = !affectsLeft && !affectsRight
        ? startW
        : Math.max(110, startW + (affectsLeft ? -deltaX : deltaX))
      const newH = !affectsTop && !affectsBottom
        ? startH
        : Math.max(90, startH + (affectsTop ? -deltaY : deltaY))
      setLiveSize({ w: newW, h: newH })
      onPreviewResize?.(config.id, newW, newH, direction, deltaX, deltaY)
    }

    function onMouseUp(ev: MouseEvent) {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      const deltaX = ev.clientX - startX
      const deltaY = ev.clientY - startY
      const newW = !affectsLeft && !affectsRight
        ? startW
        : Math.max(110, startW + (affectsLeft ? -deltaX : deltaX))
      const newH = !affectsTop && !affectsBottom
        ? startH
        : Math.max(90, startH + (affectsTop ? -deltaY : deltaY))
      setLiveSize(null)
      onCommitResize?.(config.id, newW, newH, direction, deltaX, deltaY)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const shellStyle: CSSProperties = {
    gridColumn: `${config.col_start ?? 1} / span ${config.col_span ?? 6}`,
    gridRow: `${config.row_start ?? 1} / span ${config.row_span ?? 12}`,
    opacity: isDragging ? 0.28 : 1,
    padding: GRID_ITEM_PADDING,
    '--mobile-row-span': String(Math.max(12, Math.min(26, config.row_span ?? 12))),
  } as CSSProperties

  return (
    <div
      ref={setNodeRef}
      onPointerDown={() => {
        if (editMode) onSelect(config.id)
      }}
      style={shellStyle}
      className="dashboard-widget-shell"
    >
      <div
        ref={cardRef}
        {...(editMode ? attributes : {})}
        {...(editMode ? listeners : {})}
        className={`dashboard-card group relative h-full overflow-hidden rounded-2xl transition-all duration-200 ${
          isDragging
            ? 'border-cyan-400/50 shadow-2xl shadow-cyan-500/10'
            : selected
              ? 'border-[var(--dash-border-strong)] shadow-[0_0_0_1px_var(--dash-border-strong),0_24px_60px_rgba(0,0,0,0.28)]'
              : 'hover:border-[var(--dash-border-strong)] hover:shadow-[0_22px_65px_var(--dash-glow-blue)]'
        } ${editMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={cardHeightStyle}
      >
        {editMode && (
          <>
            <div
              className={`absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-cyan-400/10 to-transparent transition-opacity ${
                selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
              title="Arraste o card"
            />
            <div
              onPointerDown={e => e.stopPropagation()}
              onMouseDown={e => handleResizeStart(e, 'top')}
              title="Ajustar altura pelo topo"
              className={`absolute left-1/2 top-0 z-20 h-3 w-16 -translate-x-1/2 cursor-ns-resize rounded-b-lg bg-white/10 transition-opacity hover:bg-white/20 ${
                selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            />
            <div
              className={`absolute right-3 top-3 z-10 flex items-center gap-1 transition-opacity ${
                selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
              onPointerDown={e => e.stopPropagation()}
            >
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

            <div
              onPointerDown={e => e.stopPropagation()}
              onMouseDown={e => handleResizeStart(e, 'left')}
              title="Ajustar largura pelo lado esquerdo"
              className={`absolute left-0 top-1/2 z-20 h-16 w-3 -translate-y-1/2 cursor-ew-resize rounded-r-lg bg-white/10 transition-opacity hover:bg-white/20 ${
                selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            />

            <div
              onPointerDown={e => e.stopPropagation()}
              onMouseDown={e => handleResizeStart(e, 'right')}
              title="Ajustar largura"
              className={`absolute right-0 top-1/2 z-10 h-16 w-3 -translate-y-1/2 cursor-ew-resize rounded-l-lg bg-white/10 transition-opacity hover:bg-white/20 ${
                selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            />

            <div
              onPointerDown={e => e.stopPropagation()}
              onMouseDown={e => handleResizeStart(e, 'bottom')}
              title="Ajustar altura"
              className={`absolute bottom-0 left-1/2 z-10 h-3 w-16 -translate-x-1/2 cursor-ns-resize rounded-t-lg bg-white/10 transition-opacity hover:bg-white/20 ${
                selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            />

            <div
              onPointerDown={e => e.stopPropagation()}
              onMouseDown={e => handleResizeStart(e, 'top-left')}
              title="Redimensionar pelo canto superior esquerdo"
              className={`absolute left-2 top-2 z-20 h-5 w-5 cursor-nwse-resize rounded-md border border-white/10 bg-[#111120]/80 transition-opacity hover:bg-white/20 ${
                selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            />

            <div
              onPointerDown={e => e.stopPropagation()}
              onMouseDown={e => handleResizeStart(e, 'top-right')}
              title="Redimensionar pelo canto superior direito"
              className={`absolute right-10 top-2 z-20 h-5 w-5 cursor-nesw-resize rounded-md border border-white/10 bg-[#111120]/80 transition-opacity hover:bg-white/20 ${
                selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            />

            <div
              onPointerDown={e => e.stopPropagation()}
              onMouseDown={e => handleResizeStart(e, 'bottom-left')}
              title="Redimensionar pelo canto inferior esquerdo"
              className={`absolute bottom-2 left-2 z-20 h-5 w-5 cursor-nesw-resize rounded-md border border-white/10 bg-[#111120]/80 transition-opacity hover:bg-white/20 ${
                selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            />

            <div
              onPointerDown={e => e.stopPropagation()}
              onMouseDown={e => handleResizeStart(e, 'bottom-right')}
              title="Arrastar para redimensionar"
              className={`absolute bottom-2 right-2 z-10 cursor-se-resize rounded-md border border-white/10 bg-[#111120]/80 p-1 transition-opacity ${
                selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
              style={{
                width: 20,
                height: 20,
                backgroundImage: 'radial-gradient(circle, #475569 1.5px, transparent 1.5px)',
                backgroundSize: '4px 4px',
              }}
            />
          </>
        )}

        {config.type === 'metric' && data.kind === 'metric' && (
          <MetricWidget
            title={config.title}
            value={data.value}
            subValue={data.subValue}
            dataSource={config.data_source}
          />
        )}

        {config.type === 'line' && data.kind === 'series' && (
          <LineChartWidget
            title={config.title}
            points={data.points}
            isBRL={isBRL}
            dualCurrency={data.dualCurrency}
            chartHeight={chartHeight}
          />
        )}

        {config.type === 'bar' && data.kind === 'series' && (
          <BarChartWidget
            title={config.title}
            points={data.points}
            isBRL={isBRL}
            dualCurrency={data.dualCurrency}
            chartHeight={chartHeight}
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
      </div>
    </div>
  )
}
