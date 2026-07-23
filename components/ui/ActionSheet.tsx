'use client'

import type { ReactNode } from 'react'

export type ActionSheetItem = {
  key: string
  label: string
  icon: ReactNode
  onClick: () => void
  destructive?: boolean
  disabled?: boolean
}

// Menu de ações que sobe de baixo pra cima, pensado pro toque no celular — usado
// no lugar de fileiras de botões de ícone minúsculos (difíceis de acertar com o
// dedo). Cada item vem com ícone + rótulo por extenso, numa faixa alta o
// suficiente pra ser confortável de tocar.
export function ActionSheet({
  open,
  onClose,
  title,
  items,
}: {
  open: boolean
  onClose: () => void
  title?: string
  items: ActionSheetItem[]
}) {
  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[71] max-h-[80vh] overflow-y-auto rounded-t-3xl border-t p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/40"
        style={{ background: '#15151f', borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <div className="mx-auto mb-2 mt-1 h-1 w-10 shrink-0 rounded-full bg-white/15" />
        {title && (
          <p className="truncate px-3 pb-2 pt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
        )}
        <div className="space-y-0.5">
          {items.map(item => (
            <button
              key={item.key}
              onClick={() => { item.onClick(); onClose() }}
              disabled={item.disabled}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors disabled:opacity-40 ${
                item.destructive ? 'text-red-400 hover:bg-red-500/10' : 'text-slate-200 hover:bg-white/5'
              }`}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ background: item.destructive ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)' }}
              >
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-2 w-full rounded-xl py-3 text-center text-sm font-semibold text-slate-500 hover:bg-white/5"
        >
          Cancelar
        </button>
      </div>
    </>
  )
}
