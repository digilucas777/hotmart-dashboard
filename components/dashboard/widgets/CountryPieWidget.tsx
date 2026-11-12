'use client'

import { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { SeriesPoint } from '@/lib/utils'

// "Por País": rosca + ranking com bandeira, nome do país, % e total de vendas.
// No centro: % do país líder (ou do país com o mouse em cima) e o total de vendas dele.
const CORES = ['#22d3ee', '#a78bfa', '#34d399', '#f59e0b', '#f472b6', '#60a5fa', '#fb7185', '#facc15', '#2dd4bf', '#94a3b8']

const fmtBRL = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n)
const fmtNum = (n: number) => n.toLocaleString('pt-BR')

let nomes: Intl.DisplayNames | null = null
function nomePais(code: string) {
  if (code === 'Outros' || code === 'Desconhecido' || code === 'Unknown' || !/^[A-Za-z]{2}$/.test(code)) {
    return code === 'Unknown' || code === 'Desconhecido' ? 'Não informado' : code
  }
  try {
    nomes ??= new Intl.DisplayNames(['pt-BR'], { type: 'region' })
    return nomes.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

function Bandeira({ code }: { code: string }) {
  const [falhou, setFalhou] = useState(false)
  const iso = /^[A-Za-z]{2}$/.test(code) ? code.toLowerCase() : null
  if (!iso || falhou) {
    return (
      <span className="grid h-[14px] w-5 shrink-0 place-items-center rounded-[3px] bg-white/10 text-[8px] font-bold text-[var(--dash-faint)]">
        {code === 'Outros' ? '+' : '?'}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w40/${iso}.png`}
      alt=""
      width={20}
      height={14}
      loading="lazy"
      onError={() => setFalhou(true)}
      className="h-[14px] w-5 shrink-0 rounded-[3px] object-cover ring-1 ring-black/20"
    />
  )
}

function Dica({ active, payload, total }: { active?: boolean; payload?: { payload: { code: string; value: number; revenue: number } }[]; total: number }) {
  if (!active || !payload?.length) return null
  const p = payload[0]!.payload
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0f1e] px-3 py-2 shadow-xl">
      <p className="text-sm font-semibold text-slate-100">{nomePais(p.code)}</p>
      <p className="text-xs text-slate-400">
        {fmtNum(p.value)} {p.value === 1 ? 'venda' : 'vendas'} · {total > 0 ? ((p.value / total) * 100).toFixed(1) : '0'}%
      </p>
      {p.revenue > 0 && <p className="text-xs text-slate-400">{fmtBRL(p.revenue)}</p>}
    </div>
  )
}

export function CountryPieWidget({ title, points, chartHeight = 220 }: { title: string; points: SeriesPoint[]; chartHeight?: number }) {
  const [ativo, setAtivo] = useState<number | null>(null)
  const empty = points.length === 0 || points.every(p => (p.value ?? 0) === 0)
  const data = points
    .filter(p => (p.value ?? 0) > 0)
    .map(p => ({ code: p.label, value: p.value, revenue: p.valueBRL ?? 0 }))
  const total = data.reduce((s, d) => s + d.value, 0)
  const destaque = data[ativo ?? 0]
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0)
  const tamanho = Math.max(110, Math.min(chartHeight - 24, 190))

  return (
    <div className="relative z-[1] flex h-full min-h-0 flex-col p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--dash-text)]">{title}</h3>
        {!empty && (
          <span className="shrink-0 text-[11px] text-[var(--dash-faint)]">
            {fmtNum(total)} {total === 1 ? 'venda aprovada' : 'vendas aprovadas'}
          </span>
        )}
      </div>

      {empty ? (
        <div className="grid flex-1 place-items-center text-xs font-semibold text-[var(--dash-faint)]">Aguardando vendas aprovadas</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-wrap items-center gap-x-5 gap-y-3">
          <div className="relative mx-auto shrink-0" style={{ width: tamanho, height: tamanho }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="code"
                  cx="50%"
                  cy="50%"
                  innerRadius="66%"
                  outerRadius="96%"
                  paddingAngle={data.length > 1 ? 2 : 0}
                  minAngle={3}
                  cornerRadius={4}
                  stroke="none"
                  isAnimationActive={false}
                  onMouseEnter={(_, i) => setAtivo(i)}
                  onMouseLeave={() => setAtivo(null)}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={CORES[i % CORES.length]} opacity={ativo === null || ativo === i ? 1 : 0.35} />
                  ))}
                </Pie>
                <Tooltip content={<Dica total={total} />} />
              </PieChart>
            </ResponsiveContainer>
            {destaque && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div className="flex flex-col items-center gap-0.5">
                  <Bandeira code={destaque.code} />
                  <p className="text-[1.55rem] font-black leading-none tabular-nums text-[var(--dash-text)]">
                    {Math.round(pct(destaque.value))}%
                  </p>
                  <p className="text-[11px] font-semibold tabular-nums text-[var(--dash-muted)]">
                    {fmtNum(destaque.value)} {destaque.value === 1 ? 'venda' : 'vendas'}
                  </p>
                </div>
              </div>
            )}
          </div>

          <ul className="flex min-w-[170px] flex-1 flex-col gap-2 self-stretch overflow-y-auto pr-1">
            {data.map((d, i) => (
              <li
                key={d.code}
                className={`min-w-0 rounded-lg px-1.5 py-1 transition-colors ${ativo === i ? 'bg-white/5' : ''}`}
                onMouseEnter={() => setAtivo(i)}
                onMouseLeave={() => setAtivo(null)}
                title={d.revenue > 0 ? `${nomePais(d.code)}: ${fmtBRL(d.revenue)}` : nomePais(d.code)}
              >
                <div className="flex min-w-0 items-center gap-2 text-xs">
                  <Bandeira code={d.code} />
                  <span className="truncate font-medium text-[var(--dash-text)]">{nomePais(d.code)}</span>
                  <span className="ml-auto shrink-0 font-semibold tabular-nums text-[var(--dash-text)]">{pct(d.value).toFixed(pct(d.value) < 10 ? 1 : 0)}%</span>
                  <span className="w-14 shrink-0 text-right tabular-nums text-[var(--dash-faint)]">{fmtNum(d.value)}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(pct(d.value), 1.5)}%`, backgroundColor: CORES[i % CORES.length] }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
