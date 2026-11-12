'use client'

import { useMemo, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { SeriesPoint } from '@/lib/utils'
import { codigoPais, nomePaisPt, urlBandeira } from '@/lib/paises'

// "Por País": rosca (10 maiores + Outros) e ranking numerado de TODOS os países, com
// bandeira, nome em português, % e total de vendas, com barra de rolagem.
// No centro: % do país líder (ou do país com o mouse em cima) e o total de vendas dele.
// O país vem salvo como nome ("Brasil", "United States"...): lib/paises converte pra código.
const CORES = ['#22d3ee', '#a78bfa', '#34d399', '#f59e0b', '#f472b6', '#60a5fa', '#fb7185', '#facc15', '#2dd4bf', '#c084fc']
const COR_OUTROS = '#64748b'

const fmtBRL = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n)
const fmtNum = (n: number) => n.toLocaleString('pt-BR')

type Linha = { chave: string; codigo: string | null; nome: string; value: number; revenue: number }

function Bandeira({ codigo, grande = false }: { codigo: string | null; grande?: boolean }) {
  const [falhou, setFalhou] = useState(false)
  const w = grande ? 26 : 20
  const h = grande ? 18 : 14
  if (!codigo || falhou) {
    return (
      <span className="grid shrink-0 place-items-center rounded-[3px] bg-white/10 text-[8px] font-bold text-[var(--dash-faint)]" style={{ width: w, height: h }}>
        ?
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={urlBandeira(codigo)}
      alt=""
      width={w}
      height={h}
      onError={() => setFalhou(true)}
      className="shrink-0 rounded-[3px] object-cover ring-1 ring-black/25"
      style={{ width: w, height: h }}
    />
  )
}

function Dica({ active, payload, total }: { active?: boolean; payload?: { payload: Linha }[]; total: number }) {
  if (!active || !payload?.length) return null
  const p = payload[0]!.payload
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0f1e] px-3 py-2 shadow-xl">
      <p className="text-sm font-semibold text-slate-100">{p.nome}</p>
      <p className="text-xs text-slate-400">
        {fmtNum(p.value)} {p.value === 1 ? 'venda' : 'vendas'} · {total > 0 ? ((p.value / total) * 100).toFixed(1) : '0'}%
      </p>
      {p.revenue > 0 && <p className="text-xs text-slate-400">{fmtBRL(p.revenue)}</p>}
    </div>
  )
}

export function CountryPieWidget({ title, points, chartHeight = 220 }: { title: string; points: SeriesPoint[]; chartHeight?: number }) {
  const [ativo, setAtivo] = useState<string | null>(null)

  // Junta nomes diferentes do mesmo país ("Brasil" e "Brazil") pelo código.
  const ranking = useMemo<Linha[]>(() => {
    const m = new Map<string, Linha>()
    for (const p of points) {
      if (!(p.value > 0)) continue
      const codigo = p.label === 'Outros' ? null : codigoPais(p.label)
      const chave = codigo ?? p.label
      const atual = m.get(chave) ?? { chave, codigo, nome: nomePaisPt(p.label), value: 0, revenue: 0 }
      atual.value += p.value
      atual.revenue += p.valueBRL ?? 0
      m.set(chave, atual)
    }
    return Array.from(m.values()).sort((a, b) => b.value - a.value)
  }, [points])

  const total = ranking.reduce((s, d) => s + d.value, 0)
  const fatias = useMemo<Linha[]>(() => {
    if (ranking.length <= 11) return ranking
    const resto = ranking.slice(10)
    return [...ranking.slice(0, 10), {
      chave: '__outros', codigo: null, nome: `Outros (${resto.length} países)`,
      value: resto.reduce((s, r) => s + r.value, 0), revenue: resto.reduce((s, r) => s + r.revenue, 0),
    }]
  }, [ranking])

  const corDe = (chave: string) => {
    const i = fatias.findIndex(f => f.chave === chave)
    return i < 0 || fatias[i]!.chave === '__outros' ? COR_OUTROS : CORES[i % CORES.length]!
  }
  const destaque = ranking.find(r => r.chave === ativo) ?? fatias.find(f => f.chave === ativo) ?? ranking[0]
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0)
  const fmtPct = (v: number) => `${pct(v).toFixed(pct(v) < 10 ? 1 : 0)}%`
  const tamanho = Math.max(120, Math.min(chartHeight - 30, 200))

  return (
    <div className="relative z-[1] flex h-full min-h-0 flex-col p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--dash-text)]">{title}</h3>
        {total > 0 && (
          <span className="shrink-0 text-[11px] text-[var(--dash-faint)]">
            {fmtNum(total)} {total === 1 ? 'venda aprovada' : 'vendas aprovadas'} · {ranking.length} {ranking.length === 1 ? 'país' : 'países'}
          </span>
        )}
      </div>

      {total === 0 ? (
        <div className="grid flex-1 place-items-center text-xs font-semibold text-[var(--dash-faint)]">Aguardando vendas aprovadas</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-wrap items-center gap-x-5 gap-y-3">
          <div className="relative mx-auto shrink-0" style={{ width: tamanho, height: tamanho }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Pie
                  data={fatias}
                  dataKey="value"
                  nameKey="nome"
                  cx="50%"
                  cy="50%"
                  innerRadius="66%"
                  outerRadius="96%"
                  paddingAngle={fatias.length > 1 ? 2 : 0}
                  minAngle={3}
                  cornerRadius={4}
                  stroke="none"
                  isAnimationActive={false}
                  onMouseEnter={(_, i) => setAtivo(fatias[i]?.chave ?? null)}
                  onMouseLeave={() => setAtivo(null)}
                >
                  {fatias.map(f => (
                    <Cell key={f.chave} fill={corDe(f.chave)} opacity={ativo === null || ativo === f.chave ? 1 : 0.35} />
                  ))}
                </Pie>
                <Tooltip content={<Dica total={total} />} />
              </PieChart>
            </ResponsiveContainer>
            {destaque && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div className="flex max-w-[64%] flex-col items-center gap-1">
                  {destaque.chave !== '__outros' && <Bandeira codigo={destaque.codigo} grande />}
                  <p className="text-[1.6rem] font-black leading-none tabular-nums text-[var(--dash-text)]">
                    {Math.round(pct(destaque.value))}%
                  </p>
                  <p className="text-[11px] font-semibold leading-tight tabular-nums text-[var(--dash-muted)]">
                    {fmtNum(destaque.value)} {destaque.value === 1 ? 'venda' : 'vendas'}
                  </p>
                  <p className="w-full truncate text-[10px] leading-tight text-[var(--dash-faint)]">{destaque.nome}</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex min-h-0 min-w-[190px] flex-1 flex-col self-stretch">
            <div className="mb-1 flex items-center gap-2 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--dash-faint)]">
              <span className="w-5 text-right">#</span>
              <span>País</span>
              <span className="ml-auto">%</span>
              <span className="w-14 text-right">Vendas</span>
            </div>
            <ol className="dash-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" style={{ maxHeight: Math.max(tamanho, chartHeight - 40) }}>
              {ranking.map((d, i) => (
                <li
                  key={d.chave}
                  className={`rounded-lg px-1.5 py-1 transition-colors ${ativo === d.chave ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
                  onMouseEnter={() => setAtivo(d.chave)}
                  onMouseLeave={() => setAtivo(null)}
                  title={d.revenue > 0 ? `${d.nome}: ${fmtBRL(d.revenue)}` : d.nome}
                >
                  <div className="flex min-w-0 items-center gap-2 text-xs">
                    <span className={`w-5 shrink-0 text-right text-[11px] font-bold tabular-nums ${i < 3 ? 'text-[var(--dash-text)]' : 'text-[var(--dash-faint)]'}`}>
                      {i + 1}º
                    </span>
                    <Bandeira codigo={d.codigo} />
                    <span className="truncate font-medium text-[var(--dash-text)]">{d.nome}</span>
                    <span className="ml-auto shrink-0 font-semibold tabular-nums text-[var(--dash-text)]">{fmtPct(d.value)}</span>
                    <span className="w-14 shrink-0 text-right tabular-nums text-[var(--dash-faint)]">{fmtNum(d.value)}</span>
                  </div>
                  <div className="ml-7 mt-1 h-1 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(pct(d.value), 1.5)}%`, backgroundColor: corDe(d.chave) }} />
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
