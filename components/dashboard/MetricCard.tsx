'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, type LucideIcon } from 'lucide-react'

const COLOR_MAP: Record<string, { icon: string; bg: string }> = {
  indigo: { icon: 'text-indigo-400', bg: 'bg-indigo-500/12' },
  green: { icon: 'text-green-400', bg: 'bg-green-500/12' },
  red: { icon: 'text-red-400', bg: 'bg-red-500/12' },
  yellow: { icon: 'text-yellow-400', bg: 'bg-yellow-500/12' },
  orange: { icon: 'text-orange-400', bg: 'bg-orange-500/12' },
  blue: { icon: 'text-blue-400', bg: 'bg-blue-500/12' },
  purple: { icon: 'text-purple-400', bg: 'bg-purple-500/12' },
}

export interface MetricCardProps {
  id: string
  icon: LucideIcon
  label: string
  value: string
  subValue?: string
  color: string
  locked: boolean
}

export function MetricCard({
  id,
  icon: Icon,
  label,
  value,
  subValue,
  color,
  locked,
}: MetricCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: locked })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  const colors = COLOR_MAP[color] ?? COLOR_MAP.indigo

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-2xl border bg-[#191929] p-5 transition-all duration-200 ${
        isDragging
          ? 'border-indigo-500/50 shadow-2xl shadow-indigo-500/20'
          : 'border-white/7 hover:border-white/14'
      }`}
    >
      {!locked && (
        <button
          {...attributes}
          {...listeners}
          className="absolute right-3 top-3 cursor-grab rounded-lg p-1 text-slate-600 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
          aria-label="Arrastar card"
        >
          <GripVertical size={14} />
        </button>
      )}

      <div className="flex flex-col gap-3">
        <div
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${colors.bg}`}
        >
          <Icon size={17} className={colors.icon} />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-[1.6rem] font-bold leading-tight tracking-tight text-slate-100">
            {value}
          </p>
          {subValue && (
            <p className="mt-0.5 text-xs text-slate-600">{subValue}</p>
          )}
        </div>
      </div>
    </div>
  )
}
