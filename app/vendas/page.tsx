'use client'

import { useState, useEffect } from 'react'
import { ShoppingCart } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { SalesTable } from '@/components/dashboard/SalesTable'
import type { Venda } from '@/lib/types'
import { Spinner } from '@/components/ui/Spinner'

export default function VendasPage() {
  const [vendas, setVendas] = useState<Venda[]>([])
  const [loading, setLoading] = useState(true)
  const [exchangeRate, setExchangeRate] = useState(5.85)

  useEffect(() => {
    fetch('/api/exchange-rate')
      .then(r => r.json())
      .then((d: { rate: number }) => setExchangeRate(d.rate ?? 5.85))
      .catch(() => {})
  }, [])

  useEffect(() => {
    supabase
      .from('vendas')
      .select('*')
      .order('data_venda', { ascending: false })
      .then(({ data }) => {
        setVendas((data ?? []) as Venda[])
        setLoading(false)
      })
  }, [])

  return (
    <div className="min-h-screen">
      <header
        className="sticky top-0 z-40 border-b"
        style={{
          borderColor: 'rgba(255,255,255,0.07)',
          background: 'rgba(11,11,20,0.85)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2.5 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20">
            <ShoppingCart size={15} className="text-indigo-400" />
          </div>
          <span className="text-sm font-bold text-slate-100">Vendas</span>
          {!loading && (
            <span
              className="rounded-full px-2 py-0.5 text-xs text-slate-500"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              {vendas.length} transações
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-8">
        {loading ? (
          <div className="flex h-52 items-center justify-center">
            <Spinner size={28} />
          </div>
        ) : (
          <SalesTable vendas={vendas} exchangeRate={exchangeRate} />
        )}
      </main>
    </div>
  )
}
