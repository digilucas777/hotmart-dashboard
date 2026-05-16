'use client'

import { useState, useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2 } from 'lucide-react'
import { computeWidgetData, getValueFormat } from '@/lib/utils'
import type { WidgetConfig, Venda, Period } from '@/lib/types'
import { MetricWidget } from './MetricWidget'
import { LineChartWidget } from './LineChartWidget'
import { BarChartWidget } from './BarChartWidget'
import { PieWidget } from './PieWidget'
import { CombinedChartWidget } from './CombinedChartWidget'
import { SalesTable } from '@/components/dashboard/SalesTable'

const CHART_HEIGHT_MAP: Record<string, number> = {
  small: 150,
  medium: 220,
  large: 300,
  extra: 400,
}

const LEGACY_WIDTHS: Record<string, string> = {
  'full':  '100%',
  'half':  'calc(50% - 12px)',
  '1/2':   'calc(50% - 12px)',
  '1/3':   'calc(33.333% - 16px)',
  '1/4':   'calc(25% - 18px)',
  '2/3':   'calc(66.666% - 8px)',
  '3/4':   'calc(75% - 6px)',
}

function resolveWidth(w: string): string {
  if (w.includes('px')) return w
  return LEGACY_WIDTHS[w] ?? 'calc(50% - 12px)'
}

export function WidgetRenderer({
  config,
  vendas,
  period,
  exchangeRate,
  custoTotal = 0,
  editMode,
  onDelete,
  onUpdateConfig,
}: {
  config: WidgetConfig
  vendas: Venda[]
  period: Period
  exchangeRate: number
  custoTotal?: number
  editMode: boolean
  onDelete: (id: string) => void
  onUpdateConfig?: (id: string, updates: { width?: string; height?: string }) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [liveSize, setLiveSize] = useState<{ w: number; h: number } | null>(null)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: config.id, disabled: !editMode })

  const data = computeWidgetData(vendas, config.data_source, period, exchangeRate, custoTotal)
  const isBRL = getValueFormat(config.data_source) === 'brl'

  const chartHeight = liveSize
    ? Math.max(150, liveSize.h - 80)
    : config.height?.includes('px')
      ? Math.max(150, parseInt(config.height) - 80)
      : CHART_HEIGHT_MAP[config.height ?? 'medium'] ?? 220

  const widthStyle = liveSize ? `${liveSize.w}px` : resolveWidth(config.width)
  const minHeightStyle = liveSize
    ? `${liveSize.h}px`
    : config.height?.includes('px')
      ? config.height
      : undefined

  const dndStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const container = containerRef.current
    if (!container) return

    const startX = e.clientX
    const startY = e.clientY
    const startW = container.offsetWidth
    const startH = container.offsetHeight

    function onMouseMove(ev: MouseEvent) {
      const newW = Math.max(200, startW + ev.clientX - startX)
      const newH = Math.max(200, startH + ev.clientY - startY)
      setLiveSize({ w: newW, h: newH })
    }

    function onMouseUp(ev: MouseEvent) {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      const newW = Math.max(200, startW + ev.clientX - startX)
      const newH = Math.max(200, startH + ev.clientY - startY)
      setLiveSize(null)
      onUpdateConfig?.(config.id, { width: `${newW}px`, height: `${newH}px` })
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div
      ref={(el: HTMLDivElement | null) => {
        setNodeRef(el)
        containerRef.current = el
      }}
      style={{
        ...dndStyle,
        width: widthStyle,
        flexShrink: 0,
        maxWidth: '100%',
        ...(minHeightStyle ? { minHeight: minHeightStyle } : {}),
      }}
    >
      <div
        className={`group relative h-full rounded-2xl border bg-[#191929] transition-all ${
          isDragging
            ? 'border-indigo-500/50 shadow-2xl shadow-indigo-500/10'
            : 'border-white/7 hover:border-white/12'
        }`}
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
            points={data.points}
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
