'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutGrid,
  ShoppingCart,
  FileText,
  Plug,
  Settings,
  LayoutDashboard,
} from 'lucide-react'

const NAV_ITEMS = [
  { icon: LayoutGrid, label: 'Dashboards', href: '/' },
  { icon: ShoppingCart, label: 'Vendas', href: '/vendas' },
  { icon: FileText, label: 'Relatórios', href: '/relatorios' },
  { icon: Plug, label: 'Integrações', href: '/integracoes' },
  { icon: Settings, label: 'Configurações', href: '/configuracoes' },
]

function isNavActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/' || pathname.startsWith('/dashboard')
  return pathname.startsWith(href)
}

export function Sidebar() {
  const [expanded, setExpanded] = useState(false)
  const pathname = usePathname()

  return (
    <aside
      className="sticky top-0 z-50 flex h-screen flex-shrink-0 flex-col overflow-hidden"
      style={{
        width: expanded ? '220px' : '60px',
        transition: 'width 0.2s ease',
        background: '#0d0d1a',
        borderRight: '1px solid rgba(255,255,255,0.07)',
      }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* Logo */}
      <div
        className="flex h-14 flex-shrink-0 items-center gap-3 px-[18px]"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-500/20">
          <LayoutDashboard size={14} className="text-indigo-400" />
        </div>
        <span
          className="whitespace-nowrap text-sm font-bold text-slate-100"
          style={{ opacity: expanded ? 1 : 0, transition: 'opacity 0.15s ease' }}
        >
          Hotmart
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 p-2 pt-3">
        {NAV_ITEMS.map(item => {
          const active = isNavActive(item.href, pathname)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              title={!expanded ? item.label : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                active
                  ? 'text-indigo-300'
                  : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
              }`}
              style={active ? { background: 'rgba(99,102,241,0.12)' } : undefined}
            >
              <Icon size={17} className="flex-shrink-0" />
              <span
                className="whitespace-nowrap text-sm font-medium"
                style={{ opacity: expanded ? 1 : 0, transition: 'opacity 0.15s ease' }}
              >
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
