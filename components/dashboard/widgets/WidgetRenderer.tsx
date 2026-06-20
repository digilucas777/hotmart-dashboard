'use client'

import { memo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Copy, Pencil, Trash2 } from 'lucide-react'
import { computeComparableMetric, computeWidgetData, formatPeriodComparisonLabel, getValueFormat } from '@/lib/utils'
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
  previousVendas,
  combinedVendas,
  period,
  exchangeRate,
  custoTotal = 0,
  customRange,
  editMode,
  loading,
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
  previousVendas?: Venda[]
  combinedVendas?: Venda[]
  period: Period
  exchangeRate: number
  custoTotal?: number
  customRange?: { from: Date; to: Date }
  editMode: boolean
  loading?: boolean
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

  // custoTotal prop já é displayCustoTotal (Meta + custoManualTotal) vindo de DashboardClient
  const effectiveCusto = custoTotal

  const data = isMetaWidget
    ? (() => {
        const mock = computeMetaWidgetData(config.data_source, effectivePeriod)
        if (isMetaLinked && metaInsights && mock.kind === 'meta-metric') {
          const real = getInsightsValue(config.data_source, metaInsights)
          if (real !== null) return { ...mock, value: real.value, valueUsd: real.valueUsd, change: 0 }
        }
        return mock
      })()
    : computeWidgetData(vendas, config.data_source, effectivePeriod, exchangeRate, effectiveCusto, customRange)

  const isBRL = !isMetaWidget && getValueFormat(config.data_source) === 'brl'
  const comparison = !isMetaWidget && data.kind === 'metric' && previousVendas
    ? (() => {
        const current = computeComparableMetric(vendas, config.data_source, exchangeRate, custoTotal)
        const previous = computeComparableMetric(previousVendas, config.data_source, exchangeRate, custoTotal)
        if (current === null || previous === null || previous === 0) return null
        const pct = ((current - previous) / Math.abs(previous)) * 100
        if (Math.abs(pct) < 0.1) return `• 0% vs ${formatPeriodComparisonLabel(period)}`
        return `${pct > 0 ? '↑' : '↓'} ${pct > 0 ? '+' : ''}${pct.toFixed(0)}% vs ${formatPeriodComparisonLabel(period)}`
      })()
    : null

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

      {loading && (
        <div className="pointer-events-none absolute inset-x-4 top-3 z-40 h-0.5 overflow-hidden rounded-full bg-white/5">
          <div className="h-full w-1/3 rounded-full bg-cyan-300/70" />
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
          isDemo={!isMetaLinked}
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
  prev.previousVendas === next.previousVendas &&
  prev.combinedVendas === next.combinedVendas &&
  prev.period === next.period &&
  prev.exchangeRate === next.exchangeRate &&
  prev.custoTotal === next.custoTotal &&
  prev.customRange === next.customRange &&
  prev.editMode === next.editMode &&
  prev.loading === next.loading &&
  prev.selected === next.selected &&
  prev.linkedMetaAccountId === next.linkedMetaAccountId &&
  prev.metaInsights === next.metaInsights &&
  prev.metaAds === next.metaAds &&
  prev.metaCampaigns === next.metaCampaigns
)
