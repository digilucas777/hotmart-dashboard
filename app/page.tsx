'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Venda = { id: string; produto: string; comprador_nome: string; comprador_email: string; valor: number; status: string; data_venda: string }
type Produto = { id: string; hotmart_id: string; nome: string }
type Projeto = { id: string; nome: string; descricao: string }

export default function Home() {
  const [tela, setTela] = useState<'projetos' | 'dashboard' | 'config'>('projetos')
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [projetoAtivo, setProjetoAtivo] = useState<Projeto | null>(null)
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [produtosSelecionados, setProdutosSelecionados] = useState<string[]>([])
  const [vendas, setVendas] = useState<Venda[]>([])
  const [novoNome, setNovoNome] = useState('')
  const [novaDesc, setNovaDesc] = useState('')

  useEffect(() => { carregarProjetos() }, [])

  async function carregarProjetos() {
    const { data } = await supabase.from('projetos').select('*').order('data_criacao')
    setProjetos(data || [])
  }

  async function criarProjeto() {
    if (!novoNome.trim()) return
    await supabase.from('projetos').insert({ nome: novoNome, descricao: novaDesc })
    setNovoNome(''); setNovaDesc('')
    carregarProjetos()
  }

  async function abrirProjeto(projeto: Projeto) {
    setProjetoAtivo(projeto)

    // Carrega produtos disponíveis
    const { data: prods } = await supabase.from('produtos').select('*').order('nome')
    setProdutos(prods || [])

    // Carrega produtos do projeto
    const { data: pp } = await supabase.from('projeto_produtos').select('produto_id').eq('projeto_id', projeto.id)
    setProdutosSelecionados(pp?.map(p => p.produto_id) || [])

    // Carrega vendas dos produtos do projeto
    await carregarVendas(projeto.id)
    setTela('dashboard')
  }

  async function carregarVendas(projeto_id: string) {
    const { data: pp } = await supabase.from('projeto_produtos').select('produto_id').eq('projeto_id', projeto_id)
    const ids = pp?.map(p => p.produto_id) || []
    if (ids.length === 0) { setVendas([]); return }

    const { data: prods } = await supabase.from('produtos').select('nome').in('id', ids)
    const nomes = prods?.map(p => p.nome) || []

    const { data: vs } = await supabase.from('vendas').select('*').in('produto', nomes).order('data_venda', { ascending: false })
    setVendas(vs || [])
  }

  async function salvarProdutosProjeto() {
    if (!projetoAtivo) return
    await supabase.from('projeto_produtos').delete().eq('projeto_id', projetoAtivo.id)
    if (produtosSelecionados.length > 0) {
      await supabase.from('projeto_produtos').insert(
        produtosSelecionados.map(pid => ({ projeto_id: projetoAtivo.id, produto_id: pid }))
      )
    }
    await carregarVendas(projetoAtivo.id)
    setTela('dashboard')
  }

  async function deletarProjeto(id: string) {
    await supabase.from('projetos').delete().eq('id', id)
    carregarProjetos()
  }

  const aprovadas = vendas.filter(v => v.status === 'approved')
  const reembolsos = vendas.filter(v => v.status === 'refunded')
  const pendentes = vendas.filter(v => v.status === 'pending')
  const faturamento = aprovadas.reduce((acc, v) => acc + Number(v.valor), 0)
  const chartData = [
    { name: 'Aprovadas', valor: aprovadas.length },
    { name: 'Reembolsos', valor: reembolsos.length },
    { name: 'Pendentes', valor: pendentes.length },
  ]

  // TELA: PROJETOS
  if (tela === 'projetos') return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <h1 className="text-2xl font-bold mb-6">📊 Meus Projetos</h1>

      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <h2 className="text-lg font-semibold mb-3">Novo Projeto</h2>
        <input className="w-full bg-gray-800 rounded p-2 mb-2 text-white" placeholder="Nome do projeto" value={novoNome} onChange={e => setNovoNome(e.target.value)} />
        <input className="w-full bg-gray-800 rounded p-2 mb-3 text-white" placeholder="Descrição (opcional)" value={novaDesc} onChange={e => setNovaDesc(e.target.value)} />
        <button onClick={criarProjeto} className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded font-semibold">Criar Projeto</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {projetos.map(p => (
          <div key={p.id} className="bg-gray-900 rounded-xl p-4 flex flex-col gap-2">
            <h3 className="font-bold text-lg">{p.nome}</h3>
            {p.descricao && <p className="text-gray-400 text-sm">{p.descricao}</p>}
            <div className="flex gap-2 mt-2">
              <button onClick={() => abrirProjeto(p)} className="flex-1 bg-indigo-600 hover:bg-indigo-700 px-3 py-2 rounded text-sm font-semibold">Abrir</button>
              <button onClick={() => deletarProjeto(p.id)} className="bg-red-900 hover:bg-red-800 px-3 py-2 rounded text-sm">Deletar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  // TELA: CONFIG PRODUTOS
  if (tela === 'config') return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <button onClick={() => setTela('dashboard')} className="text-gray-400 hover:text-white mb-4 text-sm">← Voltar</button>
      <h1 className="text-2xl font-bold mb-2">Produtos — {projetoAtivo?.nome}</h1>
      <p className="text-gray-400 text-sm mb-6">Selecione os produtos que aparecem neste projeto</p>

      <div className="bg-gray-900 rounded-xl p-4 mb-4 max-h-[60vh] overflow-y-auto">
        {produtos.length === 0 ? (
          <p className="text-gray-400">Nenhum produto ainda. Aguarde as primeiras vendas chegarem via webhook.</p>
        ) : produtos.map(p => (
          <label key={p.id} className="flex items-center gap-3 p-2 hover:bg-gray-800 rounded cursor-pointer">
            <input
              type="checkbox"
              checked={produtosSelecionados.includes(p.id)}
              onChange={e => setProdutosSelecionados(prev =>
                e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id)
              )}
            />
            <span className="text-xs text-gray-500 font-mono">{p.hotmart_id}</span>
            <span>{p.nome}</span>
          </label>
        ))}
      </div>

      <button onClick={salvarProdutosProjeto} className="bg-indigo-600 hover:bg-indigo-700 px-6 py-2 rounded font-semibold">Salvar</button>
    </div>
  )

  // TELA: DASHBOARD
  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setTela('projetos')} className="text-gray-400 hover:text-white text-sm">← Projetos</button>
          <h1 className="text-2xl font-bold">{projetoAtivo?.nome}</h1>
        </div>
        <button onClick={() => setTela('config')} className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded text-sm">⚙️ Produtos</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card title="Faturamento" value={`R$ ${faturamento.toFixed(2)}`} color="text-green-400" />
        <Card title="Aprovadas" value={aprovadas.length} color="text-blue-400" />
        <Card title="Reembolsos" value={reembolsos.length} color="text-red-400" />
        <Card title="Pendentes" value={pendentes.length} color="text-yellow-400" />
      </div>

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

      <div className="bg-gray-900 rounded-xl p-4">
        <h2 className="text-lg font-semibold mb-4">Últimas Vendas</h2>
        {vendas.length === 0 ? (
          <p className="text-gray-400">Nenhuma venda ainda. Configure os produtos deste projeto.</p>
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
    </div>
  )
}

function Card({ title, value, color }: { title: string; value: any; color: string }) {
  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <p className="text-gray-400 text-sm">{title}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  )
}