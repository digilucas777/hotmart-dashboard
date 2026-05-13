import type { ReactNode } from 'react'

export type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'default'

const STYLES: Record<BadgeVariant, string> = {
  success: 'bg-green-500/15 text-green-400',
  danger: 'bg-red-500/15 text-red-400',
  warning: 'bg-yellow-500/15 text-yellow-400',
  info: 'bg-blue-500/15 text-blue-400',
  default: 'bg-white/8 text-slate-400',
}

export function Badge({
  children,
  variant = 'default',
}: {
  children: ReactNode
  variant?: BadgeVariant
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[variant]}`}
    >
      {children}
    </span>
  )
}
