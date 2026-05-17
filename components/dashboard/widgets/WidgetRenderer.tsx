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
  onUpdateConfig,
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
  onUpdateConfig?: (id: string, updates: { width?: string; height?: string; col_span?: number; row_span?: number }) => void
  onPreviewResize?: (id: string, width: number, height: number) => void
  onCommitResize?: (id: string, width: number, height: number) => void
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

  function handleResizeStart(e: ReactMouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const card = cardRef.current
    if (!card) return

    const startX = e.clientX
    const startY = e.clientY
    const startW = card.offsetWidth
    const startH = card.offsetHeight

    function onMouseMove(ev: MouseEvent) {
      const newW = Math.max(110, startW + ev.clientX - startX)
      const newH = Math.max(90, startH + ev.clientY - startY)
      setLiveSize({ w: newW, h: newH })
      onPreviewResize?.(config.id, newW, newH)
    }

    function onMouseUp(ev: MouseEvent) {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      const newW = Math.max(110, startW + ev.clientX - startX)
      const newH = Math.max(90, startH + ev.clientY - startY)
      setLiveSize(null)
      onCommitResize?.(config.id, newW, newH)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div
      ref={setNodeRef}
      onPointerDown={() => {
        if (editMode) onSelect(config.id)
      }}
      style={{
        gridColumn: `${config.col_start ?? 1} / span ${config.col_span ?? 6}`,
        gridRow: `${config.row_start ?? 1} / span ${config.row_span ?? 12}`,
        opacity: isDragging ? 0.28 : 1,
        padding: GRID_ITEM_PADDING,
      }}
    >
      <div
        ref={cardRef}
        {...(editMode ? attributes : {})}
        {...(editMode ? listeners : {})}
        className={`group relative h-full overflow-hidden rounded-2xl border bg-[#191929] shadow-[0_18px_50px_rgba(0,0,0,0.24)] transition-all duration-200 ${
          isDragging
            ? 'border-indigo-500/50 shadow-2xl shadow-indigo-500/10'
            : selected
              ? 'border-white/75 shadow-[0_0_0_1px_rgba(255,255,255,0.25),0_24px_60px_rgba(0,0,0,0.35)]'
              : 'border-white/10 hover:border-white/20 hover:shadow-[0_22px_55px_rgba(0,0,0,0.32)]'
        } ${editMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={cardHeightStyle}
      >
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.055),transparent_36%,rgba(99,102,241,0.06))]" />
        {editMode && (
          <>
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
              onMouseDown={handleResizeStart}
              title="Ajustar largura"
              className={`absolute right-0 top-1/2 z-10 h-16 w-3 -translate-y-1/2 cursor-ew-resize rounded-l-lg bg-white/10 transition-opacity hover:bg-white/20 ${
                selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            />

            <div
              onPointerDown={e => e.stopPropagation()}
              onMouseDown={handleResizeStart}
              title="Ajustar altura"
              className={`absolute bottom-0 left-1/2 z-10 h-3 w-16 -translate-x-1/2 cursor-ns-resize rounded-t-lg bg-white/10 transition-opacity hover:bg-white/20 ${
                selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            />

            {/* Resize handle - bottom-right corner */}
            <div
              onPointerDown={e => e.stopPropagation()}
              onMouseDown={handleResizeStart}
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
