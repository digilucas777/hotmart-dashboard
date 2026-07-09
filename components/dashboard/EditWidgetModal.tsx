'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import type { WidgetConfig, WidgetType, WidgetDataSource } from '@/lib/types'

// ─── Source lists (mirrors AddWidgetModal) ────────────────────────────────────

const SOURCES_BY_TYPE: Record<string, { value: WidgetDataSource; label: string }[]> = {
  metric: [
    { value: 'total_converted', label: 'Total Convertido (BRL)' },
    { value: 'total_brl', label: 'Faturamento BRL' },
    { value: 'total_usd', label: 'Faturamento USD' },
    { value: 'sales_count', label: 'Vendas Aprovadas' },
    { value: 'approval_rate', label: 'Taxa de Aprovação' },
    { value: 'avg_ticket', label: 'Ticket Médio' },
    { value: 'refunds_count', label: 'Reembolsos' },
    { value: 'chargebacks_count', label: 'Chargebacks' },
    { value: 'disputed_count', label: 'Reclamado + Parcialmente Reembolsado' },
    { value: 'pending_count', label: 'Pendentes' },
    { value: 'cancelled_count', label: 'Cancelados' },
    { value: 'margem_lucro', label: 'Margem de Lucro (%)' },
    { value: 'roas', label: 'ROAS' },
    { value: 'cpa', label: 'CPA' },
  ],
  line: [
    { value: 'revenue_by_day', label: 'Faturamento por Dia' },
    { value: 'sales_by_day', label: 'Vendas por Dia' },
    { value: 'revenue_by_product', label: 'Receita por Produto' },
    { value: 'count_by_product', label: 'Vendas por Produto' },
  ],
  bar: [
    { value: 'revenue_by_day', label: 'Faturamento por Dia' },
    { value: 'sales_by_day', label: 'Vendas por Dia' },
    { value: 'revenue_by_product', label: 'Receita por Produto' },
    { value: 'count_by_product', label: 'Vendas por Produto' },
    { value: 'by_payment', label: 'Por Forma de Pagamento' },
    { value: 'by_country', label: 'Por País' },
    { value: 'by_status', label: 'Por Status' },
  ],
  pie: [
    { value: 'by_payment', label: 'Por Forma de Pagamento' },
    { value: 'by_country', label: 'Por País' },
    { value: 'by_status', label: 'Por Status' },
    { value: 'count_by_product', label: 'Vendas por Produto' },
    { value: 'revenue_by_product', label: 'Receita por Produto' },
  ],
  table:    [{ value: 'transactions',    label: 'Transações Detalhadas' }],
  combined: [{ value: 'combined_by_day', label: 'Faturamento + Vendas por Dia' }],
  'meta-metric': [
    { value: 'meta_spend',              label: 'Gasto Total' },
    { value: 'meta_roas',               label: 'ROAS (Meta Ads)' },
    { value: 'meta_impressions',        label: 'Impressões' },
    { value: 'meta_reach',              label: 'Alcance' },
    { value: 'meta_frequency',          label: 'Frequência' },
    { value: 'meta_cpc',                label: 'CPC' },
    { value: 'meta_cpm',                label: 'CPM' },
    { value: 'meta_ctr',                label: 'CTR' },
    { value: 'meta_link_clicks',        label: 'Cliques no Link' },
    { value: 'meta_page_views',         label: 'Visualizações de Página' },
    { value: 'meta_checkout_initiated', label: 'Checkouts Iniciados' },
    { value: 'meta_purchases',          label: 'Compras' },
    { value: 'meta_add_to_cart',        label: 'Adições ao Carrinho' },
    { value: 'meta_valor_compras',      label: 'Valor de Compras' },
    { value: 'meta_hook_rate',          label: 'Hook Rate' },
    { value: 'meta_connect_rate',       label: 'Connect Rate' },
  ],
  'meta-chart': [
    { value: 'meta_spend_by_day',       label: 'Gasto + Receita por Dia' },
    { value: 'meta_roas_by_day',        label: 'ROAS por Dia' },
    { value: 'meta_conversions_by_day', label: 'Conversões + Leads por Dia' },
  ],
  'meta-funnel':   [{ value: 'meta_funnel',          label: 'Funil de Conversão' }],
  'meta-campaign': [{ value: 'meta_campaigns',       label: 'Performance de Campanhas' }],
  'meta-creative': [
    { value: 'meta_creatives_ctr', label: 'Ranking de Vendas' },
  ],
}

const TYPE_LABELS: Record<string, string> = {
  metric: 'Métrica', line: 'Linha', bar: 'Barras', pie: 'Pizza', table: 'Tabela', combined: 'Combinado',
  'meta-metric': 'Meta · Métrica', 'meta-chart': 'Meta · Gráfico', 'meta-funnel': 'Meta · Funil',
  'meta-campaign': 'Meta · Campanhas', 'meta-creative': 'Meta · Criativos',
  'personalizado': 'Personalizado',
}

const PERSONALIZADO_EDIT_ITEMS = [
  { value: 'lucro' as WidgetDataSource,           label: 'Lucro',        actualType: 'metric' as WidgetType },
  { value: 'lucro_usd' as WidgetDataSource,       label: 'Lucro USD',    actualType: 'metric' as WidgetType },
  { value: 'meta_roas_geral' as WidgetDataSource, label: 'ROAS (Geral)', actualType: 'meta-metric' as WidgetType },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function EditWidgetModal({
  open,
  widget,
  onClose,
  onSave,
}: {
  open: boolean
  widget: WidgetConfig | null
  onClose: () => void
  onSave: (id: string, updates: { type: WidgetType; data_source: WidgetDataSource; title: string }) => Promise<void>
}) {
  const [step, setStep]           = useState<'type' | 'source'>('source')
  const [localType, setLocalType] = useState<WidgetType>('metric')
  const [localSrc, setLocalSrc]   = useState<WidgetDataSource>('total_converted')
  const [localTitle, setLocalTitle] = useState('')
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (widget) {
      setLocalType(widget.type)
      setLocalSrc(widget.data_source)
      setLocalTitle(widget.title)
      setStep('source')
      setSaving(false)
      setSaveError(null)
    }
  }, [widget])

  if (!widget) return null

  const sources = SOURCES_BY_TYPE[localType] ?? []
  const isMeta  = localType.startsWith('meta-')
  const isPersonalizado = localSrc === 'lucro' || localSrc === 'lucro_usd' || localSrc === 'meta_roas_geral'
  const typeDisplayLabel = isPersonalizado ? 'Personalizado' : (TYPE_LABELS[localType] ?? localType)

  async function handleSave() {
    if (!widget) return
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(widget.id, { type: localType, data_source: localSrc, title: localTitle })
    } catch (err: any) {
      setSaveError(err?.message ?? 'Erro ao salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Editar Widget" maxWidth="max-w-lg">
      <div className="space-y-5">
        {/* Type switcher */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">Tipo atual</p>
            <button
              onClick={() => setStep(step === 'type' ? 'source' : 'type')}
              className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
            >
              <ArrowLeft size={11} className={step === 'type' ? 'rotate-180' : ''} />
              {step === 'type' ? 'Ver fontes' : 'Trocar tipo'}
            </button>
          </div>
          <div className="rounded-xl bg-white/5 px-3 py-2 text-sm font-medium text-slate-300">
            {typeDisplayLabel}
          </div>
        </div>

        {/* Type selector */}
        {step === 'type' && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(Object.keys(SOURCES_BY_TYPE) as WidgetType[]).map(t => (
              <button
                key={t}
                onClick={() => {
                  setLocalType(t)
                  const firstSrc = SOURCES_BY_TYPE[t]?.[0]?.value
                  if (firstSrc) {
                    setLocalSrc(firstSrc)
                    if (!localTitle) setLocalTitle(SOURCES_BY_TYPE[t]?.[0]?.label ?? '')
                  }
                  setStep('source')
                }}
                className={`rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-all ${
                  localType === t
                    ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300'
                    : 'border-white/8 bg-white/3 text-slate-400 hover:border-white/15 hover:text-slate-200'
                }`}
              >
                {TYPE_LABELS[t] ?? t}
              </button>
            ))}
          </div>
        )}

        {/* Source selector */}
        {step === 'source' && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">Dado a exibir</p>
            <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
              {sources.map(src => (
                <button
                  key={src.value}
                  onClick={() => {
                    setLocalSrc(src.value)
                    if (!localTitle || localTitle === widget.title) {
                      setLocalTitle(src.label.replace(/^\p{Emoji}\s*/u, ''))
                    }
                  }}
                  className={`w-full rounded-xl px-3 py-2.5 text-left text-sm transition-all ${
                    localSrc === src.value
                      ? isMeta
                        ? 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/30'
                        : 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  {src.label}
                </button>
              ))}
              {/* Personalizado section — always visible */}
              <div className="pt-2">
                <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">Personalizado</p>
                {PERSONALIZADO_EDIT_ITEMS.map(item => (
                  <button
                    key={item.value}
                    onClick={() => {
                      setLocalType(item.actualType)
                      setLocalSrc(item.value)
                      if (!localTitle || localTitle === widget.title) setLocalTitle(item.label)
                    }}
                    className={`w-full rounded-xl px-3 py-2.5 text-left text-sm transition-all ${
                      localSrc === item.value
                        ? 'bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30'
                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Title */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">Título</p>
          <input
            type="text"
            value={localTitle}
            onChange={e => setLocalTitle(e.target.value)}
            className="w-full rounded-xl bg-white/5 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 outline-none ring-1 ring-white/8 focus:ring-indigo-500/50"
          />
        </div>

        {saveError && (
          <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400">{saveError}</p>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
