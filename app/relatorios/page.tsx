'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bell,
  CheckCircle2,
  Clock,
  FileText,
  MessageCircle,
  Phone,
  Plus,
  Save,
  Send,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Projeto, Venda, WidgetDataSource } from '@/lib/types'
import { computeWidgetData } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

type WhatsAppConnection = {
  id: string
  nome: string
  telefone: string
  status: string
}

type ReportSchedule = {
  id: string
  nome: string
  projeto_id: string
  whatsapp_connection_id: string | null
  destinatario: string
  frequencia: string
  horario: string
  metricas: string[]
  mensagem: string
  ativo: boolean
}

const METRIC_OPTIONS: { value: WidgetDataSource; label: string }[] = [
  { value: 'total_converted', label: 'Total convertido' },
  { value: 'total_brl', label: 'Faturamento BRL' },
  { value: 'total_usd', label: 'Faturamento USD' },
  { value: 'sales_count', label: 'Vendas aprovadas' },
  { value: 'approval_rate', label: 'Taxa de aprovação' },
  { value: 'avg_ticket', label: 'Ticket médio' },
  { value: 'refunds_count', label: 'Reembolsos' },
  { value: 'pending_count', label: 'Pendentes' },
  { value: 'cancelled_count', label: 'Cancelados' },
  { value: 'lucro', label: 'Lucro' },
  { value: 'roas', label: 'ROAS' },
  { value: 'cpa', label: 'CPA' },
]

const FREQUENCIES = [
  { value: 'daily', label: 'Diariamente' },
  { value: 'weekdays', label: 'Dias úteis' },
  { value: 'weekly', label: 'Semanalmente' },
]

const fieldClass =
  'h-10 rounded-lg border border-white/10 bg-[#121221] px-3 text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-indigo-500/60'

function todayRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const to = new Date(from.getTime() + 86_400_000)
  return { from, to }
}

export default function RelatoriosPage() {
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [connections, setConnections] = useState<WhatsAppConnection[]>([])
  const [schedules, setSchedules] = useState<ReportSchedule[]>([])
  const [vendas, setVendas] = useState<Venda[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [connectionName, setConnectionName] = useState('WhatsApp principal')
  const [connectionPhone, setConnectionPhone] = useState('')
  const [form, setForm] = useState({
    nome: 'Relatório diário',
    projeto_id: '',
    whatsapp_connection_id: '',
    destinatario: '',
    frequencia: 'daily',
    horario: '07:00',
    mensagem: 'Bom dia! Segue o relatório de {projeto} referente a hoje:',
  })
  const [metricas, setMetricas] = useState<WidgetDataSource[]>([
    'total_converted',
    'sales_count',
    'approval_rate',
    'avg_ticket',
  ])

  const selectedProject = projetos.find(p => p.id === form.projeto_id)

  const loadBase = useCallback(async () => {
    setLoading(true)
    try {
      const [projectsRes, connectionsRes, schedulesRes] = await Promise.all([
        supabase.from('projetos').select('*').order('nome'),
        supabase.from('whatsapp_connections').select('*').order('created_at', { ascending: false }),
        supabase.from('whatsapp_report_schedules').select('*').order('created_at', { ascending: false }),
      ])
      const projectRows = (projectsRes.data ?? []) as Projeto[]
      const connectionRows = (connectionsRes.data ?? []) as WhatsAppConnection[]
      setProjetos(projectRows)
      setConnections(connectionRows)
      setSchedules((schedulesRes.data ?? []) as ReportSchedule[])
      setForm(prev => ({
        ...prev,
        projeto_id: prev.projeto_id || projectRows[0]?.id || '',
        whatsapp_connection_id: prev.whatsapp_connection_id || connectionRows[0]?.id || '',
      }))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBase()
  }, [loadBase])

  useEffect(() => {
    async function loadProjectSales() {
      if (!form.projeto_id) {
        setVendas([])
        return
      }

      const { data: links } = await supabase
        .from('projeto_produtos')
        .select('produto_id')
        .eq('projeto_id', form.projeto_id)
      const produtoIds = (links ?? []).map((r: { produto_id: string }) => r.produto_id)
      if (produtoIds.length === 0) {
        setVendas([])
        return
      }

      const { data: produtos } = await supabase
        .from('produtos')
        .select('hotmart_id')
        .in('id', produtoIds)
      const hotmartIds = (produtos ?? []).map((r: { hotmart_id: string }) => r.hotmart_id)
      if (hotmartIds.length === 0) {
        setVendas([])
        return
      }

      const { from, to } = todayRange()
      const { data } = await supabase
        .from('vendas')
        .select('*')
        .in('hotmart_produto_id', hotmartIds)
        .gte('data_venda', from.toISOString())
        .lt('data_venda', to.toISOString())
      setVendas((data ?? []) as Venda[])
    }

    loadProjectSales()
  }, [form.projeto_id])

  const preview = useMemo(() => {
    const projectName = selectedProject?.nome ?? 'Projeto'
    const lines = [
      form.mensagem.replaceAll('{projeto}', projectName),
      '',
      `*${projectName}*`,
    ]

    metricas.forEach(metric => {
      const option = METRIC_OPTIONS.find(o => o.value === metric)
      const data = computeWidgetData(vendas, metric, 'today', 5.85)
      if (data.kind === 'metric') lines.push(`• ${option?.label ?? metric}: ${data.value}`)
    })

    lines.push('', `Envio: ${FREQUENCIES.find(f => f.value === form.frequencia)?.label ?? form.frequencia} às ${form.horario}`)
    return lines.join('\n')
  }, [form.frequencia, form.horario, form.mensagem, metricas, selectedProject?.nome, vendas])

  async function connectWhatsApp() {
    if (!connectionPhone.trim()) return
    setSaving(true)
    try {
      const { data } = await supabase
        .from('whatsapp_connections')
        .insert({
          nome: connectionName.trim() || 'WhatsApp',
          telefone: connectionPhone.trim(),
          status: 'connected',
        })
        .select()
        .single()
      if (data) {
        setConnections(prev => [data as WhatsAppConnection, ...prev])
        setForm(prev => ({ ...prev, whatsapp_connection_id: (data as WhatsAppConnection).id }))
        setConnectionPhone('')
      }
    } finally {
      setSaving(false)
    }
  }

  async function saveSchedule() {
    if (!form.projeto_id || !form.destinatario.trim() || metricas.length === 0) return
    setSaving(true)
    try {
      const { data } = await supabase
        .from('whatsapp_report_schedules')
        .insert({
          ...form,
          destinatario: form.destinatario.trim(),
          metricas,
          timezone: 'America/Sao_Paulo',
          ativo: true,
        })
        .select()
        .single()
      if (data) setSchedules(prev => [data as ReportSchedule, ...prev])
    } finally {
      setSaving(false)
    }
  }

  function toggleMetric(metric: WidgetDataSource) {
    setMetricas(prev => prev.includes(metric) ? prev.filter(m => m !== metric) : [...prev, metric])
  }

  return (
    <div className="min-h-screen bg-[#090912] text-slate-100">
      <header
        className="border-b"
        style={{
          borderColor: 'rgba(255,255,255,0.07)',
          background: 'rgba(11,11,20,0.95)',
        }}
      >
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2.5 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20">
            <FileText size={15} className="text-indigo-400" />
          </div>
          <span className="text-sm font-bold text-slate-100">Relatórios</span>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-8">
        {loading ? (
          <div className="flex h-72 items-center justify-center">
            <Spinner size={28} />
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
            <section className="space-y-6">
              <div className="rounded-2xl border border-white/10 bg-[#151525] p-5 shadow-2xl shadow-black/20">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-500/12 text-green-400">
                    <MessageCircle size={18} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-100">Conectar WhatsApp</h2>
                    <p className="text-xs text-slate-500">Cadastre o número que enviará os relatórios.</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <input
                    value={connectionName}
                    onChange={e => setConnectionName(e.target.value)}
                    className={`${fieldClass} w-full`}
                    placeholder="Nome da conexão"
                  />
                  <div className="flex gap-2">
                    <input
                      value={connectionPhone}
                      onChange={e => setConnectionPhone(e.target.value)}
                      className={`${fieldClass} min-w-0 flex-1`}
                      placeholder="+55 11 99999-9999"
                    />
                    <Button onClick={connectWhatsApp} disabled={saving || !connectionPhone.trim()}>
                      <Phone size={14} />
                      Conectar
                    </Button>
                  </div>
                  {connections.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {connections.map(connection => (
                        <button
                          key={connection.id}
                          onClick={() => setForm(prev => ({ ...prev, whatsapp_connection_id: connection.id }))}
                          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors ${
                            form.whatsapp_connection_id === connection.id
                              ? 'border-green-500/40 bg-green-500/10'
                              : 'border-white/8 bg-white/4 hover:bg-white/7'
                          }`}
                        >
                          <span>
                            <span className="block text-xs font-semibold text-slate-200">{connection.nome}</span>
                            <span className="block text-xs text-slate-500">{connection.telefone}</span>
                          </span>
                          <CheckCircle2 size={15} className="text-green-400" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#151525] p-5 shadow-2xl shadow-black/20">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/12 text-indigo-400">
                    <Clock size={18} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-100">Agendamento</h2>
                    <p className="text-xs text-slate-500">Defina projeto, horário e destino.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <input
                    value={form.nome}
                    onChange={e => setForm(prev => ({ ...prev, nome: e.target.value }))}
                    className={`${fieldClass} w-full`}
                    placeholder="Nome do relatório"
                  />
                  <select
                    value={form.projeto_id}
                    onChange={e => setForm(prev => ({ ...prev, projeto_id: e.target.value }))}
                    className={`${fieldClass} w-full`}
                  >
                    {projetos.map(projeto => (
                      <option key={projeto.id} value={projeto.id}>{projeto.nome}</option>
                    ))}
                  </select>
                  <input
                    value={form.destinatario}
                    onChange={e => setForm(prev => ({ ...prev, destinatario: e.target.value }))}
                    className={`${fieldClass} w-full`}
                    placeholder="WhatsApp destinatário"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={form.frequencia}
                      onChange={e => setForm(prev => ({ ...prev, frequencia: e.target.value }))}
                      className={`${fieldClass} w-full`}
                    >
                      {FREQUENCIES.map(freq => (
                        <option key={freq.value} value={freq.value}>{freq.label}</option>
                      ))}
                    </select>
                    <input
                      type="time"
                      value={form.horario}
                      onChange={e => setForm(prev => ({ ...prev, horario: e.target.value }))}
                      className={`${fieldClass} w-full`}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
              <div className="rounded-2xl border border-white/10 bg-[#151525] p-5 shadow-2xl shadow-black/20">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-100">Métricas e mensagem</h2>
                    <p className="text-xs text-slate-500">Escolha o que entra no relatório do WhatsApp.</p>
                  </div>
                  <Bell size={18} className="text-indigo-400" />
                </div>

                <textarea
                  value={form.mensagem}
                  onChange={e => setForm(prev => ({ ...prev, mensagem: e.target.value }))}
                  className="mb-5 min-h-24 w-full rounded-xl border border-white/10 bg-[#121221] p-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-500/60"
                  placeholder="Mensagem inicial"
                />

                <div className="grid gap-2 sm:grid-cols-2">
                  {METRIC_OPTIONS.map(metric => (
                    <label
                      key={metric.value}
                      className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-3 py-2.5 text-sm text-slate-300 transition-colors hover:bg-white/7"
                    >
                      <input
                        type="checkbox"
                        checked={metricas.includes(metric.value)}
                        onChange={() => toggleMetric(metric.value)}
                        className="h-4 w-4 rounded accent-indigo-500"
                      />
                      {metric.label}
                    </label>
                  ))}
                </div>

                <div className="mt-5 flex justify-end">
                  <Button
                    onClick={saveSchedule}
                    disabled={saving || !form.projeto_id || !form.destinatario.trim() || metricas.length === 0}
                  >
                    {saving ? <Spinner size={14} /> : <Save size={14} />}
                    Salvar relatório
                  </Button>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-2xl border border-white/10 bg-[#151525] p-5 shadow-2xl shadow-black/20">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-100">Prévia WhatsApp</h2>
                    <Send size={17} className="text-green-400" />
                  </div>
                  <div className="rounded-2xl bg-[#0d2018] p-4">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-green-50">{preview}</pre>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#151525] p-5 shadow-2xl shadow-black/20">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-100">Relatórios salvos</h2>
                    <Plus size={17} className="text-slate-500" />
                  </div>
                  {schedules.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-white/10 py-8 text-center text-sm text-slate-600">
                      Nenhum relatório agendado ainda.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {schedules.map(schedule => (
                        <div key={schedule.id} className="rounded-xl border border-white/8 bg-white/4 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-200">{schedule.nome}</p>
                            <span className="rounded-full bg-green-500/12 px-2 py-0.5 text-xs font-medium text-green-400">
                              {schedule.ativo ? 'Ativo' : 'Pausado'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {FREQUENCIES.find(f => f.value === schedule.frequencia)?.label ?? schedule.frequencia} às {schedule.horario.slice(0, 5)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
