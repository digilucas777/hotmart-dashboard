'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

export type Custo = { id: string; data: string; valor: number; moeda: 'BRL' | 'USD'; descricao: string | null }

const hojeKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// aceita "1.884,79", "1884,79" e "1884.79"
function lerValor(txt: string): number {
  const t = txt.trim().replace(/\s/g, '')
  if (!t) return NaN
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  return Number(normal)
}
const fmt = (v: number, m: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: m }).format(v)

// Inserir custo, no mesmo formato da dashboard, com a lista dos custos do período.
export function CustosModal({ open, onClose, installationId, custos, periodoLabel, onMudou }: {
  open: boolean
  onClose: () => void
  installationId: string
  custos: Custo[]
  periodoLabel: string
  onMudou: () => void
}) {
  const [valor, setValor] = useState('')
  const [moeda, setMoeda] = useState<'BRL' | 'USD'>('BRL')
  const [data, setData] = useState(hojeKey)
  const [descricao, setDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [apagando, setApagando] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; txt: string } | null>(null)

  async function salvar() {
    const v = lerValor(valor)
    if (!Number.isFinite(v) || v <= 0) { setMsg({ ok: false, txt: 'Digite um valor maior que zero.' }); return }
    if (!data) { setMsg({ ok: false, txt: 'Escolha a data.' }); return }
    setSalvando(true); setMsg(null)
    const r = await fetch('/api/track/custos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installation_id: installationId, data, valor: v, moeda, descricao }),
    }).catch(() => null)
    setSalvando(false)
    if (!r?.ok) { setMsg({ ok: false, txt: 'Não foi possível salvar. Tente de novo.' }); return }
    setValor(''); setDescricao('')
    setMsg({ ok: true, txt: 'Custo adicionado' })
    onMudou()
  }

  async function apagar(id: string) {
    setApagando(id)
    const r = await fetch(`/api/track/custos?id=${id}`, { method: 'DELETE' }).catch(() => null)
    setApagando(null)
    if (!r?.ok) { setMsg({ ok: false, txt: 'Não foi possível apagar.' }); return }
    onMudou()
  }

  const campo = 'h-9 w-full rounded-lg border border-white/10 bg-[#121221] px-3 text-sm text-slate-200 outline-none focus:border-indigo-500/60'
  return (
    <Modal open={open} onClose={() => { setMsg(null); onClose() }} title="Inserir custo" maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">Valor *</label>
            <input type="text" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00 ou 1.884,79" className={campo} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-400">Moeda</label>
            <select value={moeda} onChange={e => setMoeda(e.target.value as 'BRL' | 'USD')} className={campo}>
              <option value="BRL">BRL</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">Data *</label>
          <input type="date" value={data} max={hojeKey()} onChange={e => setData(e.target.value)} className={`${campo} [color-scheme:dark]`} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">Descrição (opcional)</label>
          <input type="text" value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex: Tráfego pago, ferramenta, influencer..." className={campo} maxLength={200} />
        </div>
        {msg && (
          <div className={`rounded-lg px-3 py-2 text-sm font-medium ${msg.ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-300'}`}>
            {msg.ok ? '✓ ' : '⚠ '}{msg.txt}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <Button variant="ghost" className="flex-1" onClick={() => { setMsg(null); onClose() }}>Fechar</Button>
          <Button className="flex-1" onClick={() => void salvar()} disabled={salvando}>
            {salvando && <Spinner size={14} />}
            Adicionar custo
          </Button>
        </div>

        <div className="border-t border-white/10 pt-3">
          <p className="mb-2 text-xs font-semibold text-slate-400">Custos lançados ({periodoLabel})</p>
          {custos.length === 0 ? (
            <p className="py-3 text-center text-xs text-slate-600">Nenhum custo nesse período.</p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
              {custos.map(c => (
                <div key={c.id} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-xs">
                  <span className="w-20 shrink-0 tabular-nums text-slate-500">{c.data.slice(8, 10)}/{c.data.slice(5, 7)}/{c.data.slice(0, 4)}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-400" title={c.descricao ?? ''}>{c.descricao || 'sem descrição'}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-100">{fmt(Number(c.valor), c.moeda)}</span>
                  <button type="button" onClick={() => void apagar(c.id)} disabled={apagando === c.id} className="shrink-0 rounded p-1 text-slate-500 hover:bg-rose-500/15 hover:text-rose-400 disabled:opacity-50" title="Apagar custo" aria-label="Apagar custo">
                    {apagando === c.id ? <Spinner size={11} /> : <Trash2 size={12} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
