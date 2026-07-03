'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface CalendarProps {
  from?: Date
  to?: Date
  onSelect: (range: { from?: Date; to?: Date }) => void
  initialMonth?: Date
}

const WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const MONTH_LABELS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function isSameDay(a?: Date, b?: Date) {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function buildMonthGrid(month: Date) {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const startWeekday = new Date(year, monthIndex, 1).getDay()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()

  const cells: { date: Date; inMonth: boolean }[] = []
  for (let i = 0; i < startWeekday; i++) {
    cells.push({ date: new Date(year, monthIndex, i - startWeekday + 1), inMonth: false })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: new Date(year, monthIndex, day), inMonth: true })
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1]!.date
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false })
  }
  return cells
}

export function Calendar({ from, to, onSelect, initialMonth }: CalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => startOfDay(initialMonth ?? to ?? from ?? new Date()))
  const today = startOfDay(new Date())
  const cells = buildMonthGrid(viewMonth)

  function handleDayClick(date: Date) {
    if (!from || (from && to)) {
      onSelect({ from: date, to: undefined })
      return
    }
    if (date < from) {
      onSelect({ from: date, to: undefined })
      return
    }
    onSelect({ from, to: date })
  }

  function inRange(date: Date) {
    if (!from || !to) return false
    return date > from && date < to
  }

  return (
    <div className="select-none">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
          aria-label="Mês anterior"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-xs font-bold text-slate-200">
          {MONTH_LABELS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
        </span>
        <button
          type="button"
          onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
          aria-label="Próximo mês"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-500">
        {WEEKDAY_LABELS.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map(({ date, inMonth }, i) => {
          const selected = isSameDay(date, from) || isSameDay(date, to)
          const within = inRange(date)
          const isToday = isSameDay(date, today)
          return (
            <button
              key={i}
              type="button"
              disabled={!inMonth}
              onClick={() => handleDayClick(date)}
              className={`h-8 rounded-lg text-xs font-semibold transition-colors ${
                !inMonth
                  ? 'invisible'
                  : selected
                    ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white shadow-md shadow-cyan-500/25'
                    : within
                      ? 'bg-cyan-400/15 text-cyan-200'
                      : isToday
                        ? 'border border-cyan-400/40 text-slate-100'
                        : 'text-slate-300 hover:bg-white/8'
              }`}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
