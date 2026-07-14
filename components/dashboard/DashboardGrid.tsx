'use client'

import { useState, useEffect, useRef } from 'react'
import { ResponsiveGridLayout, verticalCompactor } from 'react-grid-layout'
import type { Layout, LayoutItem } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import type { Period, Venda, WidgetConfig } from '@/lib/types'
import type { SummaryRow } from '@/lib/vendas-aggregation'
import { WidgetRenderer } from '@/components/dashboard/widgets/WidgetRenderer'
import type { MetaCreativeResult, MetaCampaignResult } from '@/lib/meta-ads-mock'

type MetaInsightsRaw = Record<string, unknown>

function widgetMinSize(type: WidgetConfig['type']): Pick<LayoutItem, 'minW' | 'minH'> {
  const isLarge = ['bar', 'pie', 'line', 'meta-chart', 'meta-funnel', 'combined', 'table', 'meta-campaign', 'meta-creative'].includes(type as string)
  return isLarge ? { minW: 3, minH: 3 } : { minW: 2, minH: 2 }
}

function widgetToLayout(w: WidgetConfig): LayoutItem {
  return {
    i: w.id,
    x: (w.col_start ?? 1) - 1,
    y: (w.row_start ?? 1) - 1,
    w: w.col_span ?? 6,
    h: w.row_span ?? 12,
    ...widgetMinSize(w.type),
  }
}

function mobileHeightForType(type: WidgetConfig['type']): number {
  if (type === 'metric' || type === 'meta-metric') return 2
  if (type === 'table' || type === 'meta-campaign' || type === 'meta-creative') return 5
  return 4
}

function applyLayout(widgets: WidgetConfig[], newLayout: Layout): WidgetConfig[] {
  return widgets.map(w => {
    const item = newLayout.find(l => l.i === w.id)
    if (!item) return w
    return {
      ...w,
      col_start: item.x + 1,
      row_start: item.y + 1,
      col_span: item.w,
      row_span: item.h,
    }
  })
}

type Props = {
  widgets: WidgetConfig[]
  isEditing: boolean
  onLayoutChange: (updated: WidgetConfig[]) => void
  onPushHistory: () => void
  vendas: Venda[]
  summaryCurrent: SummaryRow[]
  summaryPrevious: SummaryRow[]
  combinedVendas: Venda[]
  period: Period
  exchangeRate: number
  custoTotal: number
  custoManualTotal?: number
  custoUSD?: number
  customRange?: { from: Date; to: Date }
  loading: boolean
  selectedWidgetIds: Set<string>
  onSelect: (id: string, multi?: boolean) => void
  onDelete: (id: string) => void
  onDuplicate?: (id: string) => void
  onEdit?: (id: string) => void
  linkedMetaAccountId?: string | null
  metaInsights?: MetaInsightsRaw | null
  metaAds?: MetaCreativeResult | null
  metaCampaigns?: MetaCampaignResult | null
}

export function DashboardGrid({
  widgets,
  isEditing,
  onLayoutChange,
  onPushHistory,
  vendas,
  summaryCurrent,
  summaryPrevious,
  combinedVendas,
  period,
  exchangeRate,
  custoTotal,
  custoManualTotal = 0,
  custoUSD = 0,
  customRange,
  loading,
  selectedWidgetIds,
  onSelect,
  onDelete,
  onDuplicate,
  onEdit,
  linkedMetaAccountId,
  metaInsights,
  metaAds,
  metaCampaigns,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(1200)
  const [currentBreakpoint, setCurrentBreakpoint] = useState('md')

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w) setContainerWidth(w)
    })
    observer.observe(el)
    const initial = el.clientWidth || 1200
    setContainerWidth(initial)
    setCurrentBreakpoint(initial < 768 ? 'sm' : 'md')
    return () => observer.disconnect()
  }, [])

  const isMobile = currentBreakpoint === 'sm'

  const desktopLayout = widgets.map(widgetToLayout)
  const mobileLayout = widgets.reduce<LayoutItem[]>((acc, w) => {
    const h = mobileHeightForType(w.type)
    const prevY = acc.length > 0 ? acc[acc.length - 1]!.y + acc[acc.length - 1]!.h : 0
    acc.push({ i: w.id, x: 0, y: prevY, w: 2, h })
    return acc
  }, [])

  const layouts = { md: desktopLayout, sm: mobileLayout }

  return (
    <div ref={containerRef} style={{ minHeight: 400 }}>
      <ResponsiveGridLayout
        className="dashboard-rgl"
        width={containerWidth}
        layouts={layouts}
        breakpoints={{ md: 768, sm: 0 }}
        cols={{ md: 12, sm: 2 }}
        rowHeight={isMobile ? 80 : 20}
        margin={[0, 0] as [number, number]}
        containerPadding={[0, 0] as [number, number]}
        dragConfig={{ enabled: isEditing && !isMobile }}
        resizeConfig={{ enabled: isEditing && !isMobile, handles: ['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne'] }}
        compactor={verticalCompactor}
        onBreakpointChange={(bp: string) => setCurrentBreakpoint(bp)}
        onDragStop={(newLayout: Layout) => {
          onPushHistory()
          onLayoutChange(applyLayout(widgets, newLayout))
        }}
        onResizeStop={(newLayout: Layout) => {
          onPushHistory()
          onLayoutChange(applyLayout(widgets, newLayout))
        }}
      >
        {widgets.map(w => (
          <div key={w.id} className="dashboard-widget-rgl p-2.5">
            <WidgetRenderer
              config={w}
              vendas={vendas}
              summaryCurrent={summaryCurrent}
              summaryPrevious={summaryPrevious}
              combinedVendas={combinedVendas}
              period={period}
              exchangeRate={exchangeRate}
              custoTotal={custoTotal}
              custoManualTotal={custoManualTotal}
              custoUSD={custoUSD}
              customRange={customRange}
              editMode={isEditing && !isMobile}
              loading={loading}
              selected={selectedWidgetIds.has(w.id)}
              onSelect={onSelect}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onEdit={onEdit}
              linkedMetaAccountId={linkedMetaAccountId}
              metaInsights={metaInsights}
              metaAds={metaAds}
              metaCampaigns={metaCampaigns}
            />
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  )
}
