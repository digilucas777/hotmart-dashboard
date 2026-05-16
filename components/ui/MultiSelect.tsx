'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'

export type MultiSelectOption = {
  value: string
  label: string
}

export function MultiSelect({
  label,
  options,
  values,
  onChange,
  placeholder = 'Todos',
  searchable = false,
  searchPlaceholder = 'Buscar...',
}: {
  label: string
  options: MultiSelectOption[]
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  searchable?: boolean
  searchPlaceholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const selectedLabels = useMemo(
    () => options.filter(o => values.includes(o.value)).map(o => o.label),
    [options, values],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => o.label.toLowerCase().includes(q))
  }, [options, query])

  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter(v => v !== value) : [...values, value])
  }

  return (
    <div ref={rootRef} className="relative flex min-w-48 flex-col gap-1">
      <label className="text-xs text-slate-500">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex h-9 items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#191929] px-3 text-left text-xs text-slate-200 outline-none transition-colors hover:border-white/20 focus:border-indigo-500/60"
      >
        <span className="min-w-0 truncate">
          {selectedLabels.length === 0
            ? placeholder
            : selectedLabels.length === 1
              ? selectedLabels[0]
              : `${selectedLabels.length} selecionados`}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-white/10 bg-[#191929] p-2 shadow-2xl shadow-black/40">
          {searchable && (
            <div className="relative mb-2">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-8 w-full rounded-lg border border-white/10 bg-[#10101d] pl-8 pr-3 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-indigo-500/60"
              />
            </div>
          )}

          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-slate-600">Nenhuma opção</p>
            ) : (
              filtered.map(option => {
                const checked = values.includes(option.value)
                return (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs text-slate-200 transition-colors hover:bg-white/5"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(option.value)}
                      className="h-4 w-4 rounded border-white/20 bg-[#10101d] accent-indigo-500"
                    />
                    <span className="min-w-0 flex-1 break-words">{option.label}</span>
                    {checked && <Check size={13} className="text-indigo-400" />}
                  </label>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
