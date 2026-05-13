'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Venda = {
  id: string
  produto: string
  comprador_nome: string
  comprador_email: string
  valor: number
  status: string
  data_venda: string
}

export default function Home() {
  const [vendas, setVendas] = useState<Venda[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchVendas() {
      const { data, error } = await supabase.from('vendas').select('*').order('data_venda', { ascending: false })
      if (error) console.error('Erro ao buscar vendas:', error)
      else setVendas(data || [])
      setLoading(false)
    }
    fetchVendas()
  }, [])

  const aprovadas = vendas.filter(v => v.status === 'approved')
  const reembolsos = vendas.filter(v => v.status === 'refunded')
  const pendentes = vendas.filter(v => v.status === 'pending')
  const faturamento = aprovadas.reduce((acc, v) => acc + Number(v.valor), 0)

  const chartData = [
    { name: 'Aprovadas', valor: aprovadas.length },
    { name: 'Reembolsos', valor: reembolsos.length },
    { name: 'Pendentes', valor: pendentes.length },
  ]

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <h1 className="text-2xl font-bold mb-6">📊 Dashboard Hotmart</h1>

      {loading ? <p>Carregando...</p> : (
        <>
          {/* Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card title="Faturamento" value={`R$ ${faturamento.toFixed(2)}`} color="text-green-400" />
            <Card title="Aprovadas" value={aprovadas.length} color="text-blue-400" />
            <Card title="Reembolsos" value={reembolsos.length} color="text-red-400" />
            <Card title="Pendentes" value={pendentes.length} color="text-yellow-400" />
          </div>

          {/* Gráfico */}
          <div className="bg-gray-900 rounded-xl p-4 mb-8">
            <h2 className="text-lg font-semibold mb-4">Resumo de Vendas</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <XAxis dataKey="name" stroke="#aaa" />
                <YAxis stroke="#aaa" />
                <Tooltip />
                <Bar dataKey="valor" fill="#6366f1" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tabela */}
          <div className="bg-gray-900 rounded-xl p-4">
            <h2 className="text-lg font-semibold mb-4">Últimas Vendas</h2>
            {vendas.length === 0 ? (
              <p className="text-gray-400">Nenhuma venda ainda. Configure o webhook da Hotmart.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-800">
                    <th className="text-left py-2">Produto</th>
                    <th className="text-left py-2">Comprador</th>
                    <th className="text-left py-2">Valor</th>
                    <th className="text-left py-2">Status</th>
                    <th className="text-left py-2">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {vendas.map(v => (
                    <tr key={v.id} className="border-b border-gray-800 hover:bg-gray-800">
                      <td className="py-2">{v.produto}</td>
                      <td className="py-2">{v.comprador_nome}</td>
                      <td className="py-2 text-green-400">R$ {Number(v.valor).toFixed(2)}</td>
                      <td className="py-2">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          v.status === 'approved' ? 'bg-green-900 text-green-300' :
                          v.status === 'refunded' ? 'bg-red-900 text-red-300' :
                          'bg-yellow-900 text-yellow-300'
                        }`}>{v.status}</span>
                      </td>
                      <td className="py-2 text-gray-400">{new Date(v.data_venda).toLocaleDateString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Card({ title, value, color }: { title: string, value: any, color: string }) {
  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <p className="text-gray-400 text-sm">{title}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  )
}