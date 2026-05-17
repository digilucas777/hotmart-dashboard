'use client'

import { useEffect } from 'react'

const THEME_STORAGE_KEY = 'dashboard-theme'

export function ThemeBridge() {
  useEffect(() => {
    function applyTheme() {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
      document.documentElement.dataset.dashboardTheme = stored === 'light' ? 'light' : 'dark'
    }

    applyTheme()
    window.addEventListener('storage', applyTheme)
    window.addEventListener('dash-theme-change', applyTheme)

    return () => {
      window.removeEventListener('storage', applyTheme)
      window.removeEventListener('dash-theme-change', applyTheme)
    }
  }, [])

  return null
}
