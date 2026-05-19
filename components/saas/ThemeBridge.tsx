'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

const THEME_STORAGE_KEY = 'dashboard-theme'

export function ThemeBridge() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    function applyTheme() {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
      const next = stored === 'light' ? 'light' : 'dark'
      document.documentElement.dataset.dashboardTheme = next
      setTheme(next)
    }

    applyTheme()
    window.addEventListener('storage', applyTheme)
    window.addEventListener('dash-theme-change', applyTheme)

    return () => {
      window.removeEventListener('storage', applyTheme)
      window.removeEventListener('dash-theme-change', applyTheme)
    }
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    window.localStorage.setItem(THEME_STORAGE_KEY, next)
    document.documentElement.dataset.dashboardTheme = next
    window.dispatchEvent(new Event('dash-theme-change'))
    setTheme(next)
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
      className="global-theme-toggle fixed right-4 top-4 z-[120] flex h-9 w-9 items-center justify-center rounded-xl border text-slate-300 transition-colors hover:text-white"
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
