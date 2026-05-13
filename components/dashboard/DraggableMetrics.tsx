'use client'

import { useState, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { Lock, Unlock } from 'lucide-react'
import { MetricCard } from './MetricCard'
import type { LucideIcon } from 'lucide-react'

export interface MetricConfig {
  id: string
  icon: LucideIcon
  label: string
  value: string
  subValue?: string
  color: string
}

export function DraggableMetrics({ metrics }: { metrics: MetricConfig[] }) {
  const [order, setOrder] = useState<string[]>(() => metrics.map(m => m.id))
  const [locked, setLocked] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setOrder(prev => {
        const oldIdx = prev.indexOf(String(active.id))
        const newIdx = prev.indexOf(String(over.id))
        return arrayMove(prev, oldIdx, newIdx)
      })
    }
  }, [])

  const sorted = order
    .map(id => metrics.find(m => m.id === id))
    .filter(Boolean) as MetricConfig[]

  return (
    <div>
      <div className="mb-3 flex items-center justify-end">
        <button
          onClick={() => setLocked(v => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
            locked
              ? 'bg-white/8 text-slate-300'
              : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
          }`}
        >
          {locked ? <Lock size={11} /> : <Unlock size={11} />}
          {locked ? 'Layout travado' : 'Travar layout'}
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {sorted.map(m => (
              <MetricCard key={m.id} {...m} locked={locked} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
