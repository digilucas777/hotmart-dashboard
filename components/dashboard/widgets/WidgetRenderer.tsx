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

const GRID_ROW_HEIGHT = 120

export function WidgetRenderer({
  config,
  vendas,
  combinedVendas,
  period,
  exchangeRate,
  custoTotal = 0,
  editMode,
  onDelete,
  onUpdateConfig,
}: {
  config: WidgetConfig
  vendas: Venda[]
  combinedVendas?: Venda[]
  period: Period
  exchangeRate: number
  custoTotal?: number
  editMode: boolean
  onDelete: (id: string) => void
  onUpdateConfig?: (id: string, updates: { width?: string; height?: string; col_span?: number; row_span?: number }) => void
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
    : Math.max(120, (config.row_span ?? 2) * GRID_ROW_HEIGHT - 80)

  // Height applied directly on the inner card so h-full works correctly
  const cardHeightStyle: CSSProperties = liveSize
    ? { height: `${liveSize.h}px`, minHeight: '150px', overflow: 'hidden' }
    : { height: '100%', minHeight: '150px', overflow: 'hidden' }

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
      const newW = Math.max(200, startW + ev.clientX - startX)
      const newH = Math.max(150, startH + ev.clientY - startY)
      setLiveSize({ w: newW, h: newH })
    }

    function onMouseUp(ev: MouseEvent) {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      const newW = Math.max(200, startW + ev.clientX - startX)
      const newH = Math.max(150, startH + ev.clientY - startY)
      setLiveSize(null)
      const colSpan = Math.min(12, Math.max(3, Math.round(newW / 110)))
      const rowSpan = Math.max(1, Math.round(newH / GRID_ROW_HEIGHT))
      onUpdateConfig?.(config.id, { col_span: colSpan, row_span: rowSpan })
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        gridColumn: `${config.col_start ?? 1} / span ${config.col_span ?? 6}`,
        gridRow: `${config.row_start ?? 1} / span ${config.row_span ?? 2}`,
        opacity: isDragging ? 0.28 : 1,
      }}
    >
      <div
        ref={cardRef}
        className={`group relative rounded-2xl border bg-[#191929] transition-all ${
          isDragging
            ? 'border-indigo-500/50 shadow-2xl shadow-indigo-500/10'
            : 'border-white/7 hover:border-white/12'
        }`}
        style={cardHeightStyle}
      >
        {editMode && (
          <>
            <div className="absolute right-3 top-3 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={() => onDelete(config.id)}
                title="Remover widget"
                className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 size={13} />
              </button>
              <button
                {...attributes}
                {...listeners}
                title="Arrastar"
                className="cursor-grab rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-white/5 hover:text-slate-400 active:cursor-grabbing"
              >
                <GripVertical size={13} />
              </button>
            </div>

            {/* Resize handle — bottom-right corner */}
            <div
              onMouseDown={handleResizeStart}
              title="Arrastar para redimensionar"
              className="absolute bottom-1.5 right-1.5 z-10 cursor-se-resize opacity-0 transition-opacity group-hover:opacity-100"
              style={{
                width: 14,
                height: 14,
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
          <SalesTable vendas={data.vendas} exchangeRate={exchangeRate} />
        )}
      </div>
    </div>
  )
}
