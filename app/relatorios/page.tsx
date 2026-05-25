'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell,
  CheckCircle2,
  Clock,
  Clipboard,
  Download,
  FileText,
  MessageCircle,
  Phone,
  Plus,
  Save,
  Send,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Projeto, Venda, WidgetDataSource } from '@/lib/types'
import { formatBRL, formatUSD, getOfficialSaleAmount } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

type WhatsAppConnection = {
  id: string
  nome: string
  telefone: string
  provider?: string | null
  phone_number_id?: string | null
  access_token?: string | null
  api_version?: string | null
  evolution_url?: string | null
  evolution_api_key?: string | null
  evolution_instance?: string | null
  status: string
}

type ReportSchedule = {
  id: string
  nome: string
  projeto_id: string
  whatsapp_connection_id: string | null
  destinatario: string
  destinatarios?: string[]
  frequencia: string
  periodo: string
  horario: string
  metricas: string[]
  mensagem: string
  ativo: boolean
}

type MetaInsights = {
  spend_brl: number
  cpm_brl: number
  cpc_brl: number
  impressions: number
  alcance: number
  cliques_no_link: number
  ctr: number
  checkouts: number
  compras: number
  hook_rate: number
  connect_rate: number
  roas_meta: number
  roas_geral: number
}

const HOTMART_METRICS: { value: WidgetDataSource; label: string }[] = [
  { value: 'total_converted', label: 'Total convertido' },
  { value: 'total_brl', label: 'Faturamento BRL' },
  { value: 'total_usd', label: 'Faturamento USD' },
  { value: 'sales_count', label: 'Vendas aprovadas' },
  { value: 'approval_rate', label: 'Taxa de aprovação' },
  { value: 'avg_ticket', label: 'Ticket médio' },
  { value: 'refunds_count', label: 'Reembolsos' },
  { value: 'pending_count', label: 'Pendentes' },
  { value: 'cancelled_count', label: 'Cancelados' },
  { value: 'top_produtos', label: 'Top 5 Produtos' },
]

const META_METRICS: { value: WidgetDataSource; label: string }[] = [
  { value: 'meta_spend', label: 'Gasto Meta Ads' },
  { value: 'meta_roas', label: 'ROAS Meta Ads' },
  { value: 'meta_ctr', label: 'CTR' },
  { value: 'meta_cpm', label: 'CPM' },
  { value: 'meta_cpc', label: 'CPC' },
  { value: 'meta_link_clicks', label: 'Cliques no Link' },
  { value: 'meta_impressions', label: 'Impressões' },
  { value: 'meta_reach', label: 'Alcance' },
  { value: 'meta_checkout_initiated', label: 'Checkouts Iniciados' },
  { value: 'meta_purchases', label: 'Compras' },
  { value: 'meta_hook_rate', label: 'Hook Rate' },
  { value: 'meta_connect_rate', label: 'Connect Rate' },
]

const PERSONALIZADO_METRICS: { value: WidgetDataSource; label: string }[] = [
  { value: 'lucro', label: 'Lucro' },
  { value: 'meta_roas_geral', label: 'ROAS (Geral)' },
]

const ALL_METRICS = [...HOTMART_METRICS, ...META_METRICS, ...PERSONALIZADO_METRICS]

const FREQUENCIES = [
  { value: 'daily', label: 'Diariamente' },
  { value: 'weekdays', label: 'Dias úteis' },
  { value: 'weekly', label: 'Semanalmente' },
]

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'thisWeek', label: 'Esta semana' },
  { value: 'lastWeek', label: 'Semana passada' },
  { value: 'thisMonth', label: 'Este mês' },
  { value: 'lastMonth', label: 'Último mês' },
  { value: 'custom', label: 'Personalizado' },
]

const PERIOD_INFORMAL: Record<string, string> = {
  today: 'hoje',
  yesterday: 'ontem',
  thisWeek: 'esta semana',
  lastWeek: 'semana passada',
  thisMonth: 'este mês',
  lastMonth: 'último mês',
  custom: 'período personalizado',
}

const fieldClass =
  'h-10 rounded-lg border border-white/10 bg-[#121221] px-3 text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-indigo-500/60'

function reportRange(period: string, customFrom?: string, customTo?: string) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day = 86_400_000
  if (period === 'yesterday') return { from: new Date(today.getTime() - day), to: today }
  if (period === 'thisWeek') {
    const dow = (today.getDay() + 6) % 7 // Mon=0
    return { from: new Date(today.getTime() - dow * day), to: new Date(today.getTime() + day) }
  }
  if (period === 'lastWeek') {
    const dow = (today.getDay() + 6) % 7
    const startThisWeek = new Date(today.getTime() - dow * day)
    return { from: new Date(startThisWeek.getTime() - 7 * day), to: startThisWeek }
  }
  if (period === 'thisMonth') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(today.getTime() + day) }
  }
  if (period === 'lastMonth') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const to = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from, to }
  }
  if (period === 'custom' && customFrom && customTo) {
    const to = new Date(customTo)
    to.setDate(to.getDate() + 1)
    return { from: new Date(customFrom), to }
  }
  return { from: today, to: new Date(today.getTime() + day) }
}

function buildTopProdutos(vendas: Venda[]): string {
  const approved = vendas.filter(v => v.status === 'approved')
  const map = new Map<string, { count: number; brl: number; foreignUsd: number }>()
  for (const v of approved) {
    const name = v.produto ?? 'Desconhecido'
    const entry = map.get(name) ?? { count: 0, brl: 0, foreignUsd: 0 }
    entry.count++
    const amount = getOfficialSaleAmount(v)
    if (v.moeda === 'BRL') entry.brl += amount
    else entry.foreignUsd += amount
    map.set(name, entry)
  }
  const sorted = Array.from(map.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
  if (sorted.length === 0) return '🏆 Top Produtos:\n  Nenhuma venda no período.'
  const lines = ['🏆 Top Produtos:']
  sorted.forEach(([name, { count, brl, foreignUsd }], i) => {
    const brlPart = brl > 0 ? formatBRL(brl) + ' BRL' : ''
    const usdPart = foreignUsd > 0 ? formatUSD(foreignUsd) + ' USD' : ''
    const value = [brlPart, usdPart].filter(Boolean).join(' / ')
    lines.push(`  ${i + 1}. ${name} — ${count} venda${count !== 1 ? 's' : ''} | ${value}`)
  })
  return lines.join('\n')
}

function buildPeriodoLabel(period: string, customFrom?: string, customTo?: string): string {
  const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day = 86_400_000
  if (period === 'today') return `Hoje ${fmt(today)}`
  if (period === 'yesterday') return `Ontem ${fmt(new Date(today.getTime() - day))}`
  const { from, to } = reportRange(period, customFrom, customTo)
  return `de ${fmt(from)} a ${fmt(new Date(to.getTime() - day))}`
}

function buildMetricValue(vendas: Venda[], metric: WidgetDataSource, insights?: MetaInsights | null, isMetaConnected?: boolean, exchangeRate = 5.85) {
  const approved = vendas.filter(v => v.status === 'approved')
  const refunded = vendas.filter(v => v.status === 'refunded')
  const pending = vendas.filter(v => v.status === 'pending')
  const cancelled = vendas.filter(v => v.status === 'cancelled')
  const totalBRL = approved.filter(v => v.moeda === 'BRL').reduce((sum, v) => sum + getOfficialSaleAmount(v), 0)
  const totalUSD = approved.filter(v => v.moeda === 'USD').reduce((sum, v) => sum + getOfficialSaleAmount(v), 0)
  const totalConverted = totalBRL + totalUSD * exchangeRate

  if (metric === 'total_converted') return formatBRL(totalConverted)
  if (metric === 'lucro') return formatBRL(totalConverted - (isMetaConnected && insights ? insights.spend_brl : 0))
  if (metric === 'total_brl') return formatBRL(totalBRL)
  if (metric === 'total_usd') return formatUSD(totalUSD)
  if (metric === 'sales_count') return String(approved.length)
  if (metric === 'approval_rate') return vendas.length > 0 ? `${((approved.length / vendas.length) * 100).toFixed(1)}%` : '0.0%'
  if (metric === 'avg_ticket') return approved.length > 0 ? formatBRL(totalConverted / approved.length) : formatBRL(0)
  if (metric === 'refunds_count') return String(refunded.length)
  if (metric === 'pending_count') return String(pending.length)
  if (metric === 'cancelled_count') return String(cancelled.length)

  const metaKeys: WidgetDataSource[] = [
    'meta_spend', 'meta_roas', 'meta_ctr', 'meta_cpm', 'meta_cpc',
    'meta_link_clicks', 'meta_impressions', 'meta_reach', 'meta_checkout_initiated',
    'meta_purchases', 'meta_hook_rate', 'meta_connect_rate', 'meta_roas_geral',
  ]
  if (metaKeys.includes(metric)) {
    if (!isMetaConnected) return 'Não conectado'
    if (!insights) return 'Carregando...'
    if (metric === 'meta_spend') return formatBRL(insights.spend_brl)
    if (metric === 'meta_roas') return `${insights.roas_meta.toFixed(2)}x`
    if (metric === 'meta_ctr') return `${insights.ctr.toFixed(2)}%`
    if (metric === 'meta_cpm') return formatBRL(insights.cpm_brl)
    if (metric === 'meta_cpc') return formatBRL(insights.cpc_brl)
    if (metric === 'meta_link_clicks') return String(insights.cliques_no_link)
    if (metric === 'meta_impressions') return String(insights.impressions)
    if (metric === 'meta_reach') return String(insights.alcance)
    if (metric === 'meta_checkout_initiated') return String(insights.checkouts)
    if (metric === 'meta_purchases') return String(insights.compras)
    if (metric === 'meta_hook_rate') return `${insights.hook_rate.toFixed(1)}%`
    if (metric === 'meta_connect_rate') return `${insights.connect_rate.toFixed(1)}%`
    if (metric === 'meta_roas_geral') return `${insights.roas_geral.toFixed(2)}x`
  }
  return ''
}

export default function RelatoriosPage() {
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [connections, setConnections] = useState<WhatsAppConnection[]>([])
  const [schedules, setSchedules] = useState<ReportSchedule[]>([])
  const [vendas, setVendas] = useState<Venda[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [connectionName, setConnectionName] = useState('WhatsApp principal')
  const [connectionPhone, setConnectionPhone] = useState('')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [evolutionUrl, setEvolutionUrl] = useState('')
  const [evolutionApiKey, setEvolutionApiKey] = useState('')
  const [evolutionInstance, setEvolutionInstance] = useState('hotmart-dashboard')
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [qrError, setQrError] = useState<string | null>(null)
  const [form, setForm] = useState({
    nome: 'Relatório diário',
    projeto_id: '',
    whatsapp_connection_id: '',
    destinatario: '',
    frequencia: 'daily',
    periodo: 'today',
    horario: '07:00',
    mensagem: 'Bom dia! Segue o relatório de {projeto} referente a {periodo}:',
  })
  const [messageText, setMessageText] = useState('')
  const [metricas, setMetricas] = useState<WidgetDataSource[]>([
    'total_converted',
    'total_brl',
    'total_usd',
    'sales_count',
    'refunds_count',
  ])
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [metaAccountId, setMetaAccountId] = useState<string | null>(null)
  const [metaInsights, setMetaInsights] = useState<MetaInsights | null>(null)
  const [isMetaConnected, setIsMetaConnected] = useState(false)
  const [exchangeRate, setExchangeRate] = useState(5.85)
  const [selectedTemplate, setSelectedTemplate] = useState<'recuperacao' | 'trafego' | null>(null)

  const previewRef = useRef<HTMLDivElement>(null)
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
    fetch('/api/exchange-rate')
      .then(r => r.json())
      .then((d: { rate: number }) => setExchangeRate(d.rate ?? 5.85))
      .catch(() => {})
  }, [])

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

      const { from, to } = reportRange(form.periodo, customFrom, customTo)
      const { data } = await supabase
        .from('vendas')
        .select('*')
        .in('hotmart_produto_id', hotmartIds)
        .gte('data_venda', from.toISOString())
        .lt('data_venda', to.toISOString())
      setVendas((data ?? []) as Venda[])
    }

    loadProjectSales()
  }, [form.periodo, form.projeto_id, customFrom, customTo])

  useEffect(() => {
    async function loadMetaConnection() {
      setMetaAccountId(null)
      setMetaInsights(null)
      setIsMetaConnected(false)
      if (!form.projeto_id) return

      // Prefer new meta_project_accounts table
      const { data: pa } = await supabase
        .from('meta_project_accounts')
        .select('account_id')
        .eq('projeto_id', form.projeto_id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (pa?.account_id) {
        setMetaAccountId(pa.account_id)
        setIsMetaConnected(true)
        return
      }

      // Fallback: legacy account_id in meta_connections
      const { data: mc } = await supabase
        .from('meta_connections')
        .select('account_id')
        .eq('projeto_id', form.projeto_id)
        .eq('status', 'connected')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if ((mc as { account_id: string | null } | null)?.account_id) {
        setMetaAccountId((mc as { account_id: string }).account_id)
        setIsMetaConnected(true)
      }
    }
    loadMetaConnection()
  }, [form.projeto_id])

  useEffect(() => {
    async function loadMetaInsights() {
      setMetaInsights(null)
      if (!metaAccountId) return
      const PRESET_MAP: Record<string, string> = {
        today: 'today',
        yesterday: 'yesterday',
        thisWeek: 'this_week_sun_today',
        lastWeek: 'last_week_sun_sat',
        thisMonth: 'this_month',
        lastMonth: 'last_month',
      }
      const preset = PRESET_MAP[form.periodo]
      if (!preset) return
      const res = await fetch(`/api/meta/insights?account_id=${metaAccountId}&date_preset=${preset}&projeto_id=${form.projeto_id}`)
      if (!res.ok) return
      const data = await res.json()
      setMetaInsights(data as MetaInsights)
    }
    loadMetaInsights()
  }, [metaAccountId, form.periodo, form.projeto_id])

  const generatedMessage = useMemo(() => {
    const projectName = selectedProject?.nome ?? 'Projeto'
    const periodoInformal = PERIOD_INFORMAL[form.periodo] ?? PERIOD_OPTIONS.find(p => p.value === form.periodo)?.label?.toLowerCase() ?? form.periodo
    const lines = [
      form.mensagem.replaceAll('{projeto}', projectName).replaceAll('{periodo}', periodoInformal),
      '',
      `*${projectName}*`,
    ]

    metricas.forEach(metric => {
      if (metric === 'top_produtos') {
        lines.push('', buildTopProdutos(vendas))
      } else {
        const option = ALL_METRICS.find(o => o.value === metric)
        lines.push(`• ${option?.label ?? metric}: ${buildMetricValue(vendas, metric, metaInsights, isMetaConnected, exchangeRate)}`)
      }
    })

    lines.push('', `Período: ${buildPeriodoLabel(form.periodo, customFrom, customTo)}`)
    return lines.join('\n')
  }, [form.mensagem, form.periodo, metricas, selectedProject?.nome, vendas, metaInsights, isMetaConnected, exchangeRate, customFrom, customTo])

  useEffect(() => {
    setMessageText(generatedMessage)
  }, [generatedMessage])

  async function connectWhatsApp() {
    if (!connectionPhone.trim()) return
    setSaving(true)
    try {
      const { data } = await supabase
        .from('whatsapp_connections')
        .insert({
          nome: connectionName.trim() || 'WhatsApp',
          telefone: connectionPhone.trim(),
          provider: 'cloud',
          phone_number_id: phoneNumberId.trim() || null,
          access_token: accessToken.trim() || null,
          api_version: 'v25.0',
          status: 'connected',
        })
        .select()
        .single()
      if (data) {
        setConnections(prev => [data as WhatsAppConnection, ...prev])
        setForm(prev => ({ ...prev, whatsapp_connection_id: (data as WhatsAppConnection).id }))
        setConnectionPhone('')
        setPhoneNumberId('')
        setAccessToken('')
      }
    } finally {
      setSaving(false)
    }
  }

  async function generateQrCode() {
    if (!evolutionUrl.trim() || !evolutionApiKey.trim() || !evolutionInstance.trim()) return
    setSaving(true)
    setQrError(null)
    setQrImage(null)
    setPairingCode(null)
    try {
      const res = await fetch('/api/whatsapp/evolution-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: evolutionUrl.trim(),
          apiKey: evolutionApiKey.trim(),
          instanceName: evolutionInstance.trim(),
          number: connectionPhone.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Não foi possível gerar o QR Code.')

      setQrImage(json.base64 ?? null)
      setPairingCode(json.pairingCode ?? null)

      const { data } = await supabase
        .from('whatsapp_connections')
        .insert({
          nome: connectionName.trim() || evolutionInstance.trim(),
          telefone: connectionPhone.trim() || evolutionInstance.trim(),
          provider: 'evolution',
          evolution_url: evolutionUrl.trim(),
          evolution_api_key: evolutionApiKey.trim(),
          evolution_instance: evolutionInstance.trim(),
          status: 'connected',
        })
        .select()
        .single()

      if (data) {
        setConnections(prev => [data as WhatsAppConnection, ...prev])
        setForm(prev => ({ ...prev, whatsapp_connection_id: (data as WhatsAppConnection).id }))
      }
    } catch (err) {
      setQrError(err instanceof Error ? err.message : 'Não foi possível gerar o QR Code.')
    } finally {
      setSaving(false)
    }
  }

  async function saveSchedule() {
    const destinatarios = form.destinatario
      .split(/[\n,;]/)
      .map(v => v.trim())
      .filter(Boolean)
    if (!form.projeto_id || destinatarios.length === 0 || metricas.length === 0) return
    setSaving(true)
    try {
      const { data } = await supabase
        .from('whatsapp_report_schedules')
        .insert({
          ...form,
          whatsapp_connection_id: form.whatsapp_connection_id || null,
          destinatario: destinatarios[0],
          destinatarios,
          metricas,
          mensagem: messageText,
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

  function applyTemplate(template: 'recuperacao' | 'trafego') {
    const msg = 'Bom dia! Segue o relatório de {projeto} referente a {periodo}:'
    if (template === 'recuperacao') {
      setMetricas(['total_converted', 'total_brl', 'total_usd', 'sales_count', 'pending_count', 'refunds_count', 'top_produtos'])
    } else {
      setMetricas(['total_converted', 'total_usd', 'meta_spend', 'lucro', 'meta_roas_geral', 'sales_count', 'pending_count', 'top_produtos'])
    }
    setForm(prev => ({ ...prev, mensagem: msg }))
    setSelectedTemplate(template)
  }

  async function copyToClipboard() {
    await navigator.clipboard.writeText(messageText)
  }

  async function exportImage() {
    if (!previewRef.current) return
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(previewRef.current, {
        backgroundColor: '#0d2018',
        useCORS: true,
        scale: 2,
        logging: false,
      })
      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = 'relatorio.png'
      a.click()
    } catch {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const domtoimage = await import('dom-to-image' as any)
      const dataUrl = await domtoimage.default.toPng(previewRef.current, { bgcolor: '#0d2018', quality: 1 })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = 'relatorio.png'
      a.click()
    }
  }

  function openWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(messageText)}`, '_blank')
  }

  async function sendNow() {
    const recipients = form.destinatario
      .split(/[\n,;]/)
      .map(v => v.trim())
      .filter(Boolean)
    if (recipients.length === 0) return
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch('/api/whatsapp/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: form.whatsapp_connection_id,
          recipients,
          message: messageText,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao enviar teste.')
      setSendResult('Teste enviado com sucesso.')
    } catch (err) {
      setSendResult(err instanceof Error ? err.message : 'Falha ao enviar teste.')
    } finally {
      setSending(false)
    }
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
                    <h2 className="text-sm font-bold text-slate-100">Conectar via QR Code</h2>
                    <p className="text-xs text-slate-500">Use Evolution API para escanear pelo WhatsApp.</p>
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
                      placeholder="Número do WhatsApp"
                    />
                  </div>
                  <input
                    value={evolutionUrl}
                    onChange={e => setEvolutionUrl(e.target.value)}
                    className={`${fieldClass} w-full`}
                    placeholder="URL Evolution API. Ex: https://evo.seudominio.com"
                  />
                  <input
                    value={evolutionApiKey}
                    onChange={e => setEvolutionApiKey(e.target.value)}
                    className={`${fieldClass} w-full`}
                    placeholder="API key da Evolution"
                    type="password"
                  />
                  <input
                    value={evolutionInstance}
                    onChange={e => setEvolutionInstance(e.target.value)}
                    className={`${fieldClass} w-full`}
                    placeholder="Nome da instância"
                  />
                  <Button onClick={generateQrCode} disabled={saving || !evolutionUrl.trim() || !evolutionApiKey.trim() || !evolutionInstance.trim()}>
                    <MessageCircle size={14} />
                    Gerar QR Code
                  </Button>
                  {(qrImage || pairingCode || qrError) && (
                    <div className="rounded-xl border border-white/10 bg-[#10101d] p-3">
                      {qrImage && (
                        <img src={qrImage} alt="QR Code WhatsApp" className="mx-auto h-48 w-48 rounded-lg bg-white p-2" />
                      )}
                      {pairingCode && (
                        <p className="mt-2 text-center text-sm font-bold text-slate-100">Código: {pairingCode}</p>
                      )}
                      {qrError && <p className="text-xs font-semibold text-red-300">{qrError}</p>}
                      <p className="mt-2 text-center text-xs text-slate-500">
                        Abra WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho.
                      </p>
                    </div>
                  )}
                  <div className="border-t border-white/10 pt-3">
                    <p className="mb-2 text-xs font-semibold text-slate-500">Ou conectar pela Cloud API oficial</p>
                  </div>
                  <input
                    value={phoneNumberId}
                    onChange={e => setPhoneNumberId(e.target.value)}
                    className={`${fieldClass} w-full`}
                    placeholder="Phone Number ID da Meta"
                  />
                  <input
                    value={accessToken}
                    onChange={e => setAccessToken(e.target.value)}
                    className={`${fieldClass} w-full`}
                    placeholder="Access Token WhatsApp Cloud API"
                    type="password"
                  />
                  <Button onClick={connectWhatsApp} disabled={saving || !connectionPhone.trim() || !phoneNumberId.trim() || !accessToken.trim()}>
                    <Phone size={14} />
                    Conectar
                  </Button>
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
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => applyTemplate('recuperacao')}
                      className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                        selectedTemplate === 'recuperacao'
                          ? 'border-cyan-400/60 text-white'
                          : 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20'
                      }`}
                      style={selectedTemplate === 'recuperacao' ? { background: 'linear-gradient(135deg, #06b6d4 0%, #8b5cf6 100%)' } : undefined}
                    >
                      Template Recuperação
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTemplate('trafego')}
                      className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                        selectedTemplate === 'trafego'
                          ? 'border-violet-400/60 text-white'
                          : 'border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20'
                      }`}
                      style={selectedTemplate === 'trafego' ? { background: 'linear-gradient(135deg, #06b6d4 0%, #8b5cf6 100%)' } : undefined}
                    >
                      Template Tráfego
                    </button>
                  </div>
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
                    placeholder="Destinatários: um por linha, vírgula ou ;"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {PERIOD_OPTIONS.map(period => (
                      <button
                        key={period.value}
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, periodo: period.value }))}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          form.periodo === period.value
                            ? 'bg-indigo-500 text-white'
                            : 'border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'
                        }`}
                      >
                        {period.label}
                      </button>
                    ))}
                  </div>
                  {form.periodo === 'custom' && (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={customFrom}
                        onChange={e => setCustomFrom(e.target.value)}
                        className={`${fieldClass} w-full`}
                      />
                      <input
                        type="date"
                        value={customTo}
                        onChange={e => setCustomTo(e.target.value)}
                        className={`${fieldClass} w-full`}
                      />
                    </div>
                  )}
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

                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-slate-500">Mensagem</span>
                  <button
                    onClick={copyToClipboard}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10"
                  >
                    <Clipboard size={13} />
                    Copiar
                  </button>
                </div>

                <textarea
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  className="mb-5 min-h-72 w-full rounded-xl border border-white/10 bg-[#121221] p-3 text-sm leading-relaxed text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-500/60"
                  placeholder="Mensagem do WhatsApp"
                />

                <div className="space-y-4">
                  {[
                    { title: 'Hotmart', items: HOTMART_METRICS, accent: 'text-indigo-400' },
                    { title: 'Meta Ads', items: META_METRICS, accent: 'text-blue-400' },
                    { title: 'Personalizado', items: PERSONALIZADO_METRICS, accent: 'text-violet-400' },
                  ].map(({ title, items, accent }) => (
                    <div key={title}>
                      <p className={`mb-2 text-[10px] font-black uppercase tracking-widest ${accent}`}>{title}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {items.map(metric => (
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
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={exportImage}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10"
                  >
                    <Download size={13} />
                    Exportar Imagem
                  </button>
                  <button
                    onClick={openWhatsApp}
                    className="flex items-center gap-1.5 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-1.5 text-xs text-green-400 transition-colors hover:bg-green-500/20"
                  >
                    <MessageCircle size={13} />
                    Abrir WhatsApp
                  </button>
                </div>

                <div className="mt-4 flex justify-end">
                  <Button
                    variant="outline"
                    onClick={sendNow}
                    disabled={sending || !form.destinatario.trim() || !form.whatsapp_connection_id}
                    className="mr-2"
                  >
                    {sending ? <Spinner size={14} /> : <Send size={14} />}
                    Enviar agora
                  </Button>
                  <Button
                    onClick={saveSchedule}
                    disabled={saving || !form.projeto_id || !form.destinatario.trim() || metricas.length === 0}
                  >
                    {saving ? <Spinner size={14} /> : <Save size={14} />}
                    Programar
                  </Button>
                </div>
                {sendResult && (
                  <p className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                    {sendResult}
                  </p>
                )}
              </div>

              <div className="space-y-6">
                <div className="rounded-2xl border border-white/10 bg-[#151525] p-5 shadow-2xl shadow-black/20">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-100">Prévia WhatsApp</h2>
                    <Send size={17} className="text-green-400" />
                  </div>
                  <div ref={previewRef} className="rounded-2xl bg-[#0d2018] p-4">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-green-50">{messageText}</pre>
                  </div>
                  <p className="mt-2 px-1 text-xs text-slate-500">
                    Envio: {FREQUENCIES.find(f => f.value === form.frequencia)?.label ?? form.frequencia} às {form.horario}
                  </p>
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
