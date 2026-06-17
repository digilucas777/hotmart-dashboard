'use client'

import { useState, useEffect, useRef } from 'react'
import { GridLayout, horizontalCompactor } from 'react-grid-layout'
import type { Layout, LayoutItem } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import type { Period, Venda, WidgetConfig } from '@/lib/types'
import { WidgetRenderer } from '@/components/dashboard/widgets/WidgetRenderer'
import type { MetaCreativeResult, MetaCampaignResult } from '@/lib/meta-ads-mock'

type MetaInsightsRaw = Record<string, unknown>

function widgetToLayout(w: WidgetConfig): LayoutItem {
  return {
    i: w.id,
    x: (w.col_start ?? 1) - 1,
    y: (w.row_start ?? 1) - 1,
    w: w.col_span ?? 6,
    h: w.row_span ?? 12,
  }
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
  previousVendas: Venda[]
  combinedVendas: Venda[]
  period: Period
  exchangeRate: number
  custoTotal: number
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
  previousVendas,
  combinedVendas,
  period,
  exchangeRate,
  custoTotal,
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

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w) setContainerWidth(w)
    })
    observer.observe(el)
    setContainerWidth(el.clientWidth || 1200)
    return () => observer.disconnect()
  }, [])

  const layout = widgets.map(widgetToLayout)

  return (
    <div ref={containerRef}>
      <GridLayout
        className="dashboard-rgl"
        layout={layout}
        width={containerWidth}
        gridConfig={{
          cols: 12,
          rowHeight: 20,
          margin: [0, 0] as [number, number],
          containerPadding: [0, 0] as [number, number],
        }}
        dragConfig={{ enabled: isEditing, handle: '.drag-handle' }}
        resizeConfig={{ enabled: isEditing }}
        compactor={horizontalCompactor}
        onDragStop={(newLayout) => {
          onPushHistory()
          onLayoutChange(applyLayout(widgets, newLayout))
        }}
        onResizeStop={(newLayout) => {
          onPushHistory()
          onLayoutChange(applyLayout(widgets, newLayout))
        }}
      >
        {widgets.map(w => (
          <div key={w.id} className="dashboard-widget-rgl p-2.5">
            <WidgetRenderer
              config={w}
              vendas={vendas}
              previousVendas={previousVendas}
              combinedVendas={combinedVendas}
              period={period}
              exchangeRate={exchangeRate}
              custoTotal={custoTotal}
              customRange={customRange}
              editMode={isEditing}
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
      </GridLayout>
    </div>
  )
}
