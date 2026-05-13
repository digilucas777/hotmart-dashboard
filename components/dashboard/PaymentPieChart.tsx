'use client'

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { PiePoint } from '@/lib/utils'

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { name: string; value: number }[]
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0f1e] px-3 py-2 shadow-xl">
      <p className="text-sm font-semibold text-slate-100">{payload[0].name}</p>
      <p className="text-xs text-slate-500">{payload[0].value} venda(s)</p>
    </div>
  )
}

export function PaymentPieChart({ data }: { data: PiePoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-white/7 bg-[#191929] p-5">
        <p className="text-sm text-slate-600">Sem dados de pagamento</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-white/7 bg-[#191929] p-5">
      <h3 className="mb-5 text-sm font-semibold text-slate-200">
        Forma de Pagamento
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={58}
            outerRadius={88}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={7}
            formatter={value => (
              <span style={{ color: '#64748b', fontSize: 12 }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
