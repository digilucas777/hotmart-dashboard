'use client'

import { useState, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2, Pencil } from 'lucide-react'
import { computeWidgetData, getValueFormat } from '@/lib/utils'
import type { WidgetConfig, WidgetWidth, WidgetHeight, Venda, Period } from '@/lib/types'
import { MetricWidget } from './MetricWidget'
import { LineChartWidget } from './LineChartWidget'
import { BarChartWidget } from './BarChartWidget'
import { PieWidget } from './PieWidget'
import { CombinedChartWidget } from './CombinedChartWidget'
import { SalesTable } from '@/components/dashboard/SalesTable'

const WIDTH_COL: Record<string, string> = {
  'full':  'lg:col-span-12',
  'half':  'lg:col-span-6',
  '1/4':   'lg:col-span-3',
  '1/3':   'lg:col-span-4',
  '1/2':   'lg:col-span-6',
  '2/3':   'lg:col-span-8',
  '3/4':   'lg:col-span-9',
}

const CHART_HEIGHT_MAP: Record<string, number> = {
  small: 150,
  medium: 220,
  large: 300,
  extra: 400,
}

const WIDTH_OPTIONS: { value: WidgetWidth; label: string }[] = [
  { value: '1/4', label: '1/4' },
  { value: '1/3', label: '1/3' },
  { value: '1/2', label: '1/2' },
  { value: '2/3', label: '2/3' },
  { value: '3/4', label: '3/4' },
  { value: 'full', label: 'Inteira' },
]

const HEIGHT_OPTIONS: { value: WidgetHeight; label: string }[] = [
  { value: 'small', label: 'Pequena' },
  { value: 'medium', label: 'Média' },
  { value: 'large', label: 'Grande' },
  { value: 'extra', label: 'Extra' },
]

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
  onUpdateConfig?: (id: string, updates: { width?: WidgetWidth; height?: WidgetHeight }) => void
}) {
  const [showResize, setShowResize] = useState(false)

  useEffect(() => {
    if (!editMode) setShowResize(false)
  }, [editMode])

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: config.id, disabled: !editMode })

  const data = computeWidgetData(vendas, config.data_source, period, exchangeRate, custoTotal)
  const isBRL = getValueFormat(config.data_source) === 'brl'
  const chartHeight = CHART_HEIGHT_MAP[config.height ?? 'medium'] ?? 220
  const colClass = WIDTH_COL[config.width] ?? 'lg:col-span-6'

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  function handleWidthChange(w: WidgetWidth) {
    onUpdateConfig?.(config.id, { width: w })
  }

  function handleHeightChange(h: WidgetHeight) {
    onUpdateConfig?.(config.id, { height: h })
  }

  return (
    <div ref={setNodeRef} style={style} className={colClass}>
      <div
        className={`group relative h-full rounded-2xl border bg-[#191929] transition-all ${
          isDragging
            ? 'border-indigo-500/50 shadow-2xl shadow-indigo-500/10'
            : 'border-white/7 hover:border-white/12'
        }`}
      >
        {editMode && (
          <>
            <div
              className={`absolute right-3 top-3 z-10 flex items-center gap-1 transition-opacity ${
                showResize ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              <button
                onClick={() => setShowResize(v => !v)}
                title="Redimensionar"
                className={`rounded-lg p-1.5 transition-colors ${
                  showResize
                    ? 'bg-indigo-500/20 text-indigo-400'
                    : 'text-slate-600 hover:bg-white/5 hover:text-slate-400'
                }`}
              >
                <Pencil size={13} />
              </button>
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

            {showResize && (
              <div className="absolute right-3 top-10 z-20 w-52 rounded-xl border border-white/10 bg-[#0f0f1e] p-4 shadow-2xl">
                <p className="mb-2 text-xs font-medium text-slate-500">Largura</p>
                <div className="mb-4 flex flex-wrap gap-1">
                  {WIDTH_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => handleWidthChange(opt.value)}
                      className={`rounded-lg px-2 py-1 text-xs font-medium transition-all ${
                        config.width === opt.value
                          ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40'
                          : 'bg-white/5 text-slate-500 hover:bg-white/10 hover:text-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="mb-2 text-xs font-medium text-slate-500">Altura</p>
                <div className="flex flex-wrap gap-1">
                  {HEIGHT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => handleHeightChange(opt.value)}
                      className={`rounded-lg px-2 py-1 text-xs font-medium transition-all ${
                        (config.height ?? 'medium') === opt.value
                          ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40'
                          : 'bg-white/5 text-slate-500 hover:bg-white/10 hover:text-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
