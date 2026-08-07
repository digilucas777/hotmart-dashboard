'use client'

import { memo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Copy, Pencil, Trash2 } from 'lucide-react'
import { computeWidgetData, formatPeriodComparisonLabel, getValueFormat } from '@/lib/utils'
import { computeComparableFromSummary, computeWidgetDataFromSummary, type SummaryRow } from '@/lib/vendas-aggregation'
import type { Period, Venda, WidgetConfig } from '@/lib/types'
import { SalesTable } from '@/components/dashboard/SalesTable'
import { computeMetaWidgetData } from '@/lib/meta-ads-mock'
import type { MetaCreativeResult, MetaCampaignResult } from '@/lib/meta-ads-mock'
import { BarChartWidget } from './BarChartWidget'
import { CombinedChartWidget } from './CombinedChartWidget'
import { LineChartWidget } from './LineChartWidget'
import { MetricWidget } from './MetricWidget'
import { PieWidget } from './PieWidget'
import { MetaCampaignWidget } from './meta/MetaCampaignWidget'
import { MetaChartWidget } from './meta/MetaChartWidget'
import { MetaCreativeWidget } from './meta/MetaCreativeWidget'
import { MetaFunnelWidget } from './meta/MetaFunnelWidget'
import { MetaMetricWidget } from './meta/MetaMetricWidget'

const GRID_ROW_HEIGHT = 20
const GRID_ITEM_PADDING = 10

type MetaInsightsRaw = Record<string, unknown>

type InsightsValue = { value: number; valueUsd?: number }

function getInsightsValue(source: string, ins: MetaInsightsRaw): InsightsValue | null {
  const num = (k: string) => parseFloat(String(ins[k] ?? '0')) || 0
  const int = (k: string) => parseInt(String(ins[k] ?? '0'), 10) || 0

  switch (source) {
    case 'meta_spend':              return { value: num('spend_brl'),          valueUsd: num('spend_usd') }
    case 'meta_cpm':                return { value: num('cpm_brl'),            valueUsd: num('cpm_usd') }
    case 'meta_cpc':                return { value: num('cpc_brl'),            valueUsd: num('cpc_usd') }
    case 'meta_valor_compras':      return { value: num('valor_compras_brl'),  valueUsd: num('valor_compras_usd') }
    case 'meta_roas':               return { value: num('roas_meta') }
    case 'meta_roas_geral':         return { value: num('roas_geral') }
    case 'meta_impressions':        return { value: int('impressions') }
    case 'meta_reach':              return { value: int('alcance') }
    case 'meta_frequency':          return { value: num('frequencia') }
    case 'meta_link_clicks':        return { value: int('cliques_no_link') }
    case 'meta_ctr':                return { value: num('ctr') }
    case 'meta_page_views':         return { value: num('vis_pagina') }
    case 'meta_checkout_initiated': return { value: num('checkouts') }
    case 'meta_purchases':          return { value: num('compras') }
    case 'meta_add_to_cart':        return { value: num('adicoes_carrinho') }
    case 'meta_hook_rate':          return { value: num('hook_rate') }
    case 'meta_connect_rate':       return { value: num('connect_rate') }
    default:                        return null
  }
}

function WidgetRendererBase({
  config,
  vendas,
  summaryCurrent,
  summaryPrevious,
  combinedVendas,
  period,
  exchangeRate,
  exchangeRateIsFallback = false,
  custoTotal = 0,
  custoManualTotal = 0,
  custoUSD = 0,
  customRange,
  editMode,
  loading,
  vendasLoading,
  selected,
  linkedMetaAccountId,
  metaInsights,
  metaAds,
  metaCampaigns,
  onSelect,
  onDelete,
  onDuplicate,
  onEdit,
}: {
  config: WidgetConfig
  vendas: Venda[]
  summaryCurrent?: SummaryRow[]
  summaryPrevious?: SummaryRow[]
  combinedVendas?: Venda[]
  period: Period
  exchangeRate: number
  exchangeRateIsFallback?: boolean
  custoTotal?: number
  custoManualTotal?: number
  custoUSD?: number
  customRange?: { from: Date; to: Date }
  editMode: boolean
  loading?: boolean
  // Widgets de gráfico/tabela/combinado dependem de `vendas`/`combinedVendas` (busca pesada,
  // desacoplada das métricas) — usam esse loading próprio em vez do `loading` geral, que hoje
  // só reflete a busca rápida do resumo agregado.
  vendasLoading?: boolean
  selected: boolean
  linkedMetaAccountId?: string | null
  metaInsights?: MetaInsightsRaw | null
  metaAds?: MetaCreativeResult | null
  metaCampaigns?: MetaCampaignResult | null
  onSelect: (id: string, multi?: boolean) => void
  onDelete: (id: string) => void
  onDuplicate?: (id: string) => void
  onEdit?: (id: string) => void
}) {
  const [chartPeriod, setChartPeriod] = useState<Period>(period)

  const isMetaWidget = config.type.startsWith('meta-')
  const isChartWidget = config.type === 'line' || config.type === 'bar' || config.type === 'meta-chart'
  const isTimeSeries = config.data_source === 'revenue_by_day' || config.data_source === 'sales_by_day'
  const isProductChart = config.data_source === 'revenue_by_product' || config.data_source === 'count_by_product'
  const effectivePeriod = isChartWidget && isTimeSeries && period !== 'custom' ? chartPeriod : period

  const isMetaLinked = !!linkedMetaAccountId

  // Para widgets de custo: Meta spend (live) tem precedência; sem Meta, usa custoManualTotal ou custoTotal
  const costWidgets = ['lucro', 'lucro_usd', 'margem_lucro', 'roas', 'cpa']
  const effectiveCusto = costWidgets.includes(config.data_source)
    ? isMetaLinked && metaInsights?.spend_brl !== undefined
      ? parseFloat(String(metaInsights.spend_brl)) || 0
      : custoTotal  // inclui custoManualTotal via displayCustoTotal
    : custoTotal

  const effectiveCustoUSD = config.data_source === 'lucro_usd'
    ? isMetaLinked && metaInsights?.spend_usd !== undefined
      ? parseFloat(String(metaInsights.spend_usd)) || 0
      : custoUSD
    : 0

  const hasManualCost = custoManualTotal > 0

  const data = isMetaWidget
    ? (() => {
        const mock = computeMetaWidgetData(config.data_source, effectivePeriod)
        if (isMetaLinked && metaInsights && mock.kind === 'meta-metric') {
          const real = getInsightsValue(config.data_source, metaInsights)
          if (real !== null) return { ...mock, value: real.value, valueUsd: real.valueUsd, change: 0 }
        }
        // Sem Meta vinculado mas com custo manual: usa dados reais
        if (!isMetaLinked && hasManualCost && mock.kind === 'meta-metric') {
          if (config.data_source === 'meta_spend') {
            return { ...mock, value: custoManualTotal, valueUsd: custoManualTotal / exchangeRate, change: 0 }
          }
          if (config.data_source === 'meta_roas_geral') {
            const totalBRL = vendas
              .filter(v => v.status === 'approved')
              .reduce((sum, v) => sum + (v.moeda === 'BRL' ? (v.valor_operacional_final ?? 0) : (v.valor_operacional_final ?? 0) * exchangeRate), 0)
            return { ...mock, value: custoManualTotal > 0 ? totalBRL / custoManualTotal : 0, change: 0 }
          }
        }
        return mock
      })()
    // Widgets de métrica calculam o valor principal a partir do resumo agregado (rápido,
    // já chega antes das vendas cruas) quando disponível — só cai pra computeWidgetData
    // (array bruto) se o data_source não for coberto ou o resumo ainda não tiver chegado.
    : config.type === 'metric' && summaryCurrent
      ? (computeWidgetDataFromSummary(summaryCurrent, config.data_source, exchangeRate, effectiveCusto, effectiveCustoUSD)
        ?? computeWidgetData(vendas, config.data_source, effectivePeriod, exchangeRate, effectiveCusto, effectiveCustoUSD, customRange))
      : computeWidgetData(vendas, config.data_source, effectivePeriod, exchangeRate, effectiveCusto, effectiveCustoUSD, customRange)

  // "Taxa: R$X/USD" (widget total_converted) some sem aviso se essa taxa for o
  // valor de emergência do /api/exchange-rate — sem isso, o mesmo período
  // pode mostrar dois faturamentos diferentes (câmbio real numa carga, câmbio
  // de emergência noutra) sem nenhum sinal de que o número não é confiável.
  if (exchangeRateIsFallback && data.kind === 'metric' && config.data_source === 'total_converted' && data.subValue) {
    data.subValue = `${data.subValue} ⚠️ cotação indisponível, valor aproximado`
  }

  const isBRL = !isMetaWidget && getValueFormat(config.data_source) === 'brl'
  const comparison = !isMetaWidget && data.kind === 'metric' && summaryCurrent && summaryPrevious
    ? (() => {
        const current = computeComparableFromSummary(summaryCurrent, config.data_source, exchangeRate, custoTotal, effectiveCustoUSD)
        const previous = computeComparableFromSummary(summaryPrevious, config.data_source, exchangeRate, custoTotal, effectiveCustoUSD)
        if (current === null || previous === null || previous === 0) return null
        const pct = ((current - previous) / Math.abs(previous)) * 100
        if (Math.abs(pct) < 0.1) return `• 0% vs ${formatPeriodComparisonLabel(period)}`
        return `${pct > 0 ? '↑' : '↓'} ${pct > 0 ? '+' : ''}${pct.toFixed(0)}% vs ${formatPeriodComparisonLabel(period)}`
      })()
    : null

  // Gráfico/tabela/combinado dependem da busca pesada de vendas cruas — usam o loading
  // dela em vez do geral, que agora só reflete a busca rápida do resumo (métrica/meta).
  const dependsOnRawVendas = config.type === 'line' || config.type === 'bar' || config.type === 'pie' || config.type === 'combined' || config.type === 'table'
  const effectiveLoading = dependsOnRawVendas ? (vendasLoading ?? loading) : loading

  const chartHeight = Math.max(120, (config.row_span ?? 12) * GRID_ROW_HEIGHT - GRID_ITEM_PADDING * 2 - 80)

  const isSelected = selected && editMode

  const cardStyle: CSSProperties = {
    height: '100%',
    overflow: 'hidden',
    ...(isSelected ? {
      boxShadow: '0 0 0 2px rgba(34, 211, 238, 0.55), 0 0 28px rgba(34, 211, 238, 0.22), 0 0 60px rgba(34, 211, 238, 0.08)',
    } : {}),
  }

  return (
    <div
      onPointerDown={(e) => {
        if (editMode) onSelect(config.id, e.shiftKey)
      }}
      className={`dashboard-card group relative h-full rounded-2xl transition-all duration-200 ${
        isSelected
          ? 'border-cyan-400/35'
          : 'hover:border-[var(--dash-border-strong)]'
      } ${editMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={cardStyle}
    >
      {isSelected && (
        <div
          className="pointer-events-none absolute inset-0 z-20 rounded-2xl"
          style={{
            border: '2px dashed rgba(34, 211, 238, 0.65)',
            background: 'radial-gradient(ellipse at 50% 0%, rgba(34, 211, 238, 0.04), transparent 65%)',
          }}
        />
      )}


      {editMode && (
        <>
          <div
            className={`drag-handle absolute inset-x-0 top-0 z-10 h-8 cursor-grab bg-gradient-to-b from-cyan-400/10 to-transparent transition-opacity active:cursor-grabbing ${
              isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
          />
          <div
            className={`absolute right-3 top-1.5 z-30 flex items-center gap-1 transition-opacity ${
              isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            onPointerDown={e => e.stopPropagation()}
          >
            {onEdit && (
              <button
                onClick={e => {
                  e.stopPropagation()
                  onEdit(config.id)
                }}
                title="Editar widget"
                className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-white/5 hover:text-slate-400"
              >
                <Pencil size={13} />
              </button>
            )}
            {onDuplicate && (
              <button
                onClick={e => {
                  e.stopPropagation()
                  onDuplicate(config.id)
                }}
                title="Duplicar widget"
                className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-white/5 hover:text-slate-400"
              >
                <Copy size={13} />
              </button>
            )}
            <button
              onClick={e => {
                e.stopPropagation()
                onDelete(config.id)
              }}
              title="Remover widget"
              className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </>
      )}

      {effectiveLoading && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-2xl bg-black/30 backdrop-blur-[1px]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/15 border-t-white/50" />
        </div>
      )}

      {config.type === 'metric' && data.kind === 'metric' && (
        <MetricWidget
          title={config.title}
          value={data.value}
          subValue={data.subValue}
          dataSource={config.data_source}
          comparison={comparison}
          numericValue={data.numericValue}
        />
      )}
      {config.type === 'line' && data.kind === 'series' && (
        <LineChartWidget
          title={config.title}
          points={data.points}
          isBRL={isBRL}
          dualCurrency={data.dualCurrency}
          chartHeight={chartHeight}
          localPeriod={isTimeSeries ? chartPeriod : undefined}
          onChangePeriod={isTimeSeries ? setChartPeriod : undefined}
        />
      )}
      {config.type === 'bar' && data.kind === 'series' && (
        <BarChartWidget
          title={config.title}
          points={data.points}
          isBRL={isBRL}
          dualCurrency={data.dualCurrency}
          chartHeight={chartHeight}
          localPeriod={isTimeSeries ? chartPeriod : undefined}
          onChangePeriod={isTimeSeries ? setChartPeriod : undefined}
          rotateLabels={isProductChart}
        />
      )}
      {config.type === 'pie' && data.kind === 'series' && (
        <PieWidget title={config.title} points={data.points} chartHeight={chartHeight} />
      )}
      {config.type === 'combined' && data.kind === 'combined' && (
        <CombinedChartWidget
          title={config.title}
          vendas={combinedVendas ?? vendas}
          chartHeight={chartHeight}
        />
      )}
      {config.type === 'table' && data.kind === 'table' && (
        <SalesTable vendas={data.vendas} exchangeRate={exchangeRate} heightMode="fill" />
      )}
      {config.type === 'meta-metric' && data.kind === 'meta-metric' && (
        <MetaMetricWidget
          title={config.title}
          data={data}
          isDemo={!isMetaLinked && !(hasManualCost && (config.data_source === 'meta_spend' || config.data_source === 'meta_roas_geral'))}
          isPersonalizado={config.data_source === 'meta_roas_geral'}
        />
      )}
      {config.type === 'meta-funnel' && data.kind === 'meta-funnel' && (
        <MetaFunnelWidget title={config.title} data={data} isDemo={!isMetaLinked} />
      )}
      {config.type === 'meta-chart' && data.kind === 'meta-chart' && (
        <MetaChartWidget
          title={config.title}
          data={data}
          chartHeight={chartHeight}
          localPeriod={chartPeriod}
          onChangePeriod={setChartPeriod}
          isDemo={!isMetaLinked}
        />
      )}
      {config.type === 'meta-campaign' && data.kind === 'meta-campaign' && (
        <MetaCampaignWidget
          title={config.title}
          data={isMetaLinked && metaCampaigns ? metaCampaigns : data}
          isDemo={!isMetaLinked}
        />
      )}
      {config.type === 'meta-creative' && data.kind === 'meta-creative' && (
        <MetaCreativeWidget
          title={config.title}
          data={isMetaLinked && metaAds ? { ...metaAds, sortBy: data.sortBy } : data}
          isDemo={!isMetaLinked}
        />
      )}
    </div>
  )
}

export const WidgetRenderer = memo(WidgetRendererBase, (prev, next) =>
  prev.config === next.config &&
  prev.vendas === next.vendas &&
  prev.summaryCurrent === next.summaryCurrent &&
  prev.summaryPrevious === next.summaryPrevious &&
  prev.combinedVendas === next.combinedVendas &&
  prev.period === next.period &&
  prev.exchangeRate === next.exchangeRate &&
  prev.custoTotal === next.custoTotal &&
  prev.customRange === next.customRange &&
  prev.editMode === next.editMode &&
  prev.loading === next.loading &&
  prev.vendasLoading === next.vendasLoading &&
  prev.selected === next.selected &&
  prev.linkedMetaAccountId === next.linkedMetaAccountId &&
  prev.metaInsights === next.metaInsights &&
  prev.metaAds === next.metaAds &&
  prev.metaCampaigns === next.metaCampaigns
)
