'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2 } from 'lucide-react'
import { computeWidgetData, getValueFormat } from '@/lib/utils'
import type { WidgetConfig, Venda, Period } from '@/lib/types'
import { MetricWidget } from './MetricWidget'
import { LineChartWidget } from './LineChartWidget'
import { BarChartWidget } from './BarChartWidget'
import { PieWidget } from './PieWidget'
import { SalesTable } from '@/components/dashboard/SalesTable'

export function WidgetRenderer({
  config,
  vendas,
  period,
  exchangeRate,
  editMode,
  onDelete,
}: {
  config: WidgetConfig
  vendas: Venda[]
  period: Period
  exchangeRate: number
  editMode: boolean
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: config.id, disabled: !editMode })

  const data = computeWidgetData(vendas, config.data_source, period, exchangeRate)
  const isBRL = getValueFormat(config.data_source) === 'brl'

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={config.width === 'full' ? 'lg:col-span-2' : ''}
    >
      <div
        className={`group relative h-full rounded-2xl border bg-[#191929] transition-all ${
          isDragging
            ? 'border-indigo-500/50 shadow-2xl shadow-indigo-500/10'
            : 'border-white/7 hover:border-white/12'
        }`}
      >
        {editMode && (
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
          />
        )}

        {config.type === 'bar' && data.kind === 'series' && (
          <BarChartWidget title={config.title} points={data.points} isBRL={isBRL} />
        )}

        {config.type === 'pie' && data.kind === 'series' && (
          <PieWidget title={config.title} points={data.points} />
        )}

        {config.type === 'table' && data.kind === 'table' && (
          <SalesTable vendas={data.vendas} exchangeRate={exchangeRate} />
        )}
      </div>
    </div>
  )
}