'use client'

import { useState } from 'react'
import {
  BarChart2,
  LineChart,
  PieChart,
  Table2,
  Hash,
  ArrowLeft,
  Layers,
  TrendingUp,
  Filter,
  Megaphone,
  Sparkles,
  Check,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import type { WidgetType, WidgetDataSource, WidgetWidth } from '@/lib/types'

interface NewWidget {
  type: WidgetType
  data_source: WidgetDataSource
  title: string
  width: WidgetWidth
}

type Category = 'hotmart' | 'meta'

// ─── Hotmart widget types ────────────────────────────────────────────────────

const HOTMART_WIDGET_TYPES: { type: WidgetType; icon: React.ElementType; label: string; description: string }[] = [
  { type: 'metric',   icon: Hash,     label: 'Métrica',   description: 'Exibe um número em destaque' },
  { type: 'line',     icon: LineChart, label: 'Linha',     description: 'Evolução ao longo do tempo' },
  { type: 'bar',      icon: BarChart2, label: 'Barras',    description: 'Comparação entre categorias' },
  { type: 'pie',      icon: PieChart,  label: 'Pizza',     description: 'Proporção entre categorias' },
  { type: 'table',    icon: Table2,    label: 'Tabela',    description: 'Lista detalhada de transações' },
  { type: 'combined', icon: Layers,    label: 'Combinado', description: 'Faturamento + volume por dia' },
]

// ─── Meta Ads widget types ───────────────────────────────────────────────────

const META_WIDGET_TYPES: { type: WidgetType; icon: React.ElementType; label: string; description: string }[] = [
  { type: 'meta-metric',   icon: TrendingUp, label: 'Métrica',   description: 'KPI único com comparação temporal' },
  { type: 'meta-chart',    icon: LineChart,  label: 'Gráfico',   description: 'Tendência ao longo do tempo' },
  { type: 'meta-funnel',   icon: Filter,     label: 'Funil',     description: 'Funil de conversão por etapa' },
  { type: 'meta-campaign', icon: BarChart2,  label: 'Campanhas', description: 'Performance das campanhas' },
  { type: 'meta-creative', icon: Sparkles,   label: 'Criativos', description: 'Ranking de anúncios' },
]

// ─── Data sources ────────────────────────────────────────────────────────────

const METRIC_SOURCES: { value: WidgetDataSource; label: string }[] = [
  { value: 'total_converted', label: 'Total Convertido (BRL)' },
  { value: 'total_brl',       label: 'Faturamento BRL' },
  { value: 'total_usd',       label: 'Faturamento USD' },
  { value: 'sales_count',     label: 'Vendas Aprovadas' },
  { value: 'approval_rate',   label: 'Taxa de Aprovação' },
  { value: 'avg_ticket',      label: 'Ticket Médio' },
  { value: 'refunds_count',   label: 'Reembolsos' },
  { value: 'pending_count',   label: 'Pendentes' },
  { value: 'cancelled_count', label: 'Cancelados' },
  { value: 'lucro',           label: 'Lucro (Receita − Custo Ads)' },
  { value: 'margem_lucro',    label: 'Margem de Lucro (%)' },
  { value: 'roas',            label: 'ROAS (Retorno sobre Ads)' },
  { value: 'cpa',             label: 'CPA (Custo por Aquisição)' },
  { value: 'commission',      label: 'Minha Comissão (18%)' },
]

const LINE_SOURCES: { value: WidgetDataSource; label: string }[] = [
  { value: 'revenue_by_day',     label: 'Faturamento por Dia' },
  { value: 'sales_by_day',       label: 'Vendas por Dia' },
  { value: 'revenue_by_product', label: 'Receita por Produto' },
  { value: 'count_by_product',   label: 'Vendas por Produto' },
]

const BAR_SOURCES: { value: WidgetDataSource; label: string }[] = [
  { value: 'revenue_by_day',     label: 'Faturamento por Dia' },
  { value: 'sales_by_day',       label: 'Vendas por Dia' },
  { value: 'revenue_by_product', label: 'Receita por Produto' },
  { value: 'count_by_product',   label: 'Vendas por Produto' },
  { value: 'by_payment',         label: 'Por Forma de Pagamento' },
  { value: 'by_country',         label: 'Por País' },
  { value: 'by_status',          label: 'Por Status' },
]

const PIE_SOURCES: { value: WidgetDataSource; label: string }[] = [
  { value: 'by_payment',         label: 'Por Forma de Pagamento' },
  { value: 'by_country',         label: 'Por País' },
  { value: 'by_status',          label: 'Por Status' },
  { value: 'count_by_product',   label: 'Vendas por Produto' },
  { value: 'revenue_by_product', label: 'Receita por Produto' },
]

const TABLE_SOURCES:    { value: WidgetDataSource; label: string }[] = [{ value: 'transactions',   label: 'Transações Detalhadas' }]
const COMBINED_SOURCES: { value: WidgetDataSource; label: string }[] = [{ value: 'combined_by_day', label: 'Faturamento + Vendas por Dia' }]

// ─── Meta Ads data sources ───────────────────────────────────────────────────

const META_METRIC_SOURCES: { value: WidgetDataSource; label: string }[] = [
  { value: 'meta_spend',              label: '💸 Gasto Total' },
  { value: 'meta_revenue',            label: '💰 Receita' },
  { value: 'meta_roas',               label: '📈 ROAS' },
  { value: 'meta_profit',             label: '🏆 Lucro Estimado' },
  { value: 'meta_roi',                label: '🎯 ROI' },
  { value: 'meta_avg_ticket',         label: '🎫 Ticket Médio' },
  { value: 'meta_cpa',                label: '🎯 CPA' },
  { value: 'meta_cpl',                label: '🧲 CPL' },
  { value: 'meta_cpm',                label: '👁 CPM' },
  { value: 'meta_cpc',                label: '🖱 CPC' },
  { value: 'meta_ctr',                label: '⚡ CTR' },
  { value: 'meta_frequency',          label: '🔄 Frequência' },
  { value: 'meta_reach',              label: '📡 Alcance' },
  { value: 'meta_impressions',        label: '👁 Impressões' },
  { value: 'meta_link_clicks',        label: '🔗 Cliques no Link' },
  { value: 'meta_conversions',        label: '✅ Conversões' },
  { value: 'meta_leads',              label: '🧲 Leads' },
  { value: 'meta_purchases',          label: '🛒 Compras' },
  { value: 'meta_checkout_initiated', label: '💳 Checkouts Iniciados' },
  { value: 'meta_add_to_cart',        label: '🛒 Adições ao Carrinho' },
  { value: 'meta_page_views',         label: '📄 Visualizações de Página' },
  { value: 'meta_landing_page_views', label: '🏠 Landing Page Views' },
]

const META_CHART_SOURCES: { value: WidgetDataSource; label: string }[] = [
  { value: 'meta_spend_by_day',       label: 'Gasto + Receita por Dia' },
  { value: 'meta_roas_by_day',        label: 'ROAS por Dia' },
  { value: 'meta_conversions_by_day', label: 'Conversões + Leads por Dia' },
]

const META_FUNNEL_SOURCES:   { value: WidgetDataSource; label: string }[] = [{ value: 'meta_funnel',          label: 'Funil de Conversão' }]
const META_CAMPAIGN_SOURCES: { value: WidgetDataSource; label: string }[] = [{ value: 'meta_campaigns',       label: 'Performance de Campanhas' }]
const META_CREATIVE_SOURCES: { value: WidgetDataSource; label: string }[] = [
  { value: 'meta_creatives_ctr',  label: 'Ranking por CTR' },
  { value: 'meta_creatives_roas', label: 'Ranking por ROAS' },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function getSourcesForType(type: WidgetType): { value: WidgetDataSource; label: string }[] {
  switch (type) {
    case 'metric':        return METRIC_SOURCES
    case 'line':          return LINE_SOURCES
    case 'bar':           return BAR_SOURCES
    case 'pie':           return PIE_SOURCES
    case 'table':         return TABLE_SOURCES
    case 'combined':      return COMBINED_SOURCES
    case 'meta-metric':   return META_METRIC_SOURCES
    case 'meta-chart':    return META_CHART_SOURCES
    case 'meta-funnel':   return META_FUNNEL_SOURCES
    case 'meta-campaign': return META_CAMPAIGN_SOURCES
    case 'meta-creative': return META_CREATIVE_SOURCES
    default:              return []
  }
}

function defaultWidth(type: WidgetType): WidgetWidth {
  return type === 'metric' || type === 'meta-metric' ? 'half' : 'full'
}

function stripEmoji(label: string): string {
  return label.replace(/^\p{Emoji}\s*/u, '')
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AddWidgetModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  onAdd: (widgets: NewWidget[]) => Promise<void>
}) {
  const [step, setStep]                 = useState<1 | 2>(1)
  const [category, setCategory]         = useState<Category>('hotmart')
  const [selectedType, setSelectedType] = useState<WidgetType | null>(null)
  const [selectedSources, setSelectedSources] = useState<Set<WidgetDataSource>>(new Set())
  const [title, setTitle]               = useState('')
  const [width, setWidth]               = useState<WidgetWidth>('half')
  const [saving, setSaving]             = useState(false)

  function reset() {
    setStep(1)
    setSelectedType(null)
    setSelectedSources(new Set())
    setTitle('')
    setWidth('half')
  }

  function handleClose() {
    reset()
    onClose()
  }

  function selectType(type: WidgetType) {
    setSelectedType(type)
    setSelectedSources(new Set())
    setTitle('')
    setWidth(defaultWidth(type))
    setStep(2)
  }

  function toggleSource(src: { value: WidgetDataSource; label: string }) {
    setSelectedSources(prev => {
      const next = new Set(prev)
      if (next.has(src.value)) {
        next.delete(src.value)
        if (next.size === 0) setTitle('')
      } else {
        next.add(src.value)
        if (next.size === 1 && !title) {
          setTitle(stripEmoji(src.label))
        }
      }
      return next
    })
  }

  async function handleCreate() {
    if (!selectedType || selectedSources.size === 0) return
    setSaving(true)
    const sources = getSourcesForType(selectedType)
    try {
      const items: NewWidget[] = Array.from(selectedSources).map(srcValue => {
        const srcObj = sources.find(s => s.value === srcValue)
        const autoTitle = srcObj ? stripEmoji(srcObj.label) : 'Widget'
        return {
          type: selectedType,
          data_source: srcValue,
          title: selectedSources.size === 1 && title ? title : autoTitle,
          width,
        }
      })
      await onAdd(items)
      handleClose()
    } finally {
      setSaving(false)
    }
  }

  const widgetTypes  = category === 'meta' ? META_WIDGET_TYPES : HOTMART_WIDGET_TYPES
  const sources      = selectedType ? getSourcesForType(selectedType) : []
  const isMeta       = category === 'meta'
  const selCount     = selectedSources.size
  const singleSource = sources.length === 1

  return (
    <Modal open={open} onClose={handleClose} title="Adicionar Widget" maxWidth="max-w-lg">
      {step === 1 ? (
        <div className="space-y-4">
          {/* Category tabs */}
          <div className="flex gap-1 rounded-xl bg-white/[0.04] p-1">
            {(['hotmart', 'meta'] as Category[]).map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition-all ${
                  category === cat
                    ? cat === 'meta'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                      : 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {cat === 'hotmart' ? (
                  <>
                    <Hash size={12} />
                    Hotmart
                  </>
                ) : (
                  <>
                    <Megaphone size={12} />
                    Meta Ads
                  </>
                )}
              </button>
            ))}
          </div>

          {/* Demo notice for Meta */}
          {isMeta && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2.5">
              <Sparkles size={14} className="mt-0.5 shrink-0 text-amber-400" />
              <p className="text-xs leading-relaxed text-amber-300/80">
                Widgets Meta Ads usam dados demo. Conecte sua conta para dados reais.
              </p>
            </div>
          )}

          <p className="text-sm text-slate-500">
            {isMeta ? 'Escolha o tipo de widget Meta Ads:' : 'Escolha o tipo de visualização:'}
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {widgetTypes.map(({ type, icon: Icon, label, description }) => (
              <button
                key={type}
                onClick={() => selectType(type)}
                className={`flex flex-col items-start gap-2 rounded-xl border bg-white/3 p-4 text-left transition-all hover:bg-white/5 ${
                  isMeta
                    ? 'border-white/8 hover:border-blue-500/40'
                    : 'border-white/8 hover:border-indigo-500/40'
                }`}
              >
                <Icon size={20} className={isMeta ? 'text-blue-400' : 'text-indigo-400'} />
                <div>
                  <p className="text-sm font-medium text-slate-200">{label}</p>
                  <p className="text-xs text-slate-600">{description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <button
            onClick={() => setStep(1)}
            className="flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-300"
          >
            <ArrowLeft size={14} />
            Voltar
          </button>

          {/* Data source multi-select */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">Dado a exibir</p>
              {!singleSource && selCount > 0 && (
                <p className="text-[10px] font-semibold text-slate-600">{selCount} selecionado{selCount !== 1 ? 's' : ''}</p>
              )}
            </div>
            <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
              {sources.map(src => {
                const isSelected = selectedSources.has(src.value)
                return (
                  <button
                    key={src.value}
                    onClick={() => toggleSource(src)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all ${
                      isSelected
                        ? isMeta
                          ? 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/30'
                          : 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30'
                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all ${
                        isSelected
                          ? isMeta
                            ? 'border-blue-500 bg-blue-500'
                            : 'border-indigo-500 bg-indigo-500'
                          : 'border-white/15 bg-transparent'
                      }`}
                    >
                      {isSelected && <Check size={10} strokeWidth={3} className="text-white" />}
                    </span>
                    {src.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Title — shown only when single selection */}
          {selCount <= 1 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500">Título do widget</p>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ex: ROAS por Dia"
                className="w-full rounded-xl bg-white/5 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 outline-none ring-1 ring-white/8 focus:ring-indigo-500/50"
              />
            </div>
          )}

          {/* Width */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">Largura</p>
            <div className="flex gap-2">
              {(['half', 'full'] as WidgetWidth[]).map(w => (
                <button
                  key={w}
                  onClick={() => setWidth(w)}
                  className={`flex-1 rounded-xl py-2 text-sm font-medium transition-all ${
                    width === w
                      ? isMeta
                        ? 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/30'
                        : 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30'
                      : 'bg-white/5 text-slate-500 hover:bg-white/8 hover:text-slate-300'
                  }`}
                >
                  {w === 'half' ? 'Metade' : 'Inteira'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="ghost" className="flex-1" onClick={handleClose}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={handleCreate} disabled={selCount === 0 || saving}>
              {saving
                ? 'Criando...'
                : selCount > 1
                  ? `Adicionar ${selCount} widgets`
                  : 'Criar widget'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
