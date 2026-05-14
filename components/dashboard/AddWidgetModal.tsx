'use client'

import { useState } from 'react'
import { BarChart2, LineChart, PieChart, Table2, Hash, ArrowLeft } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import type { WidgetType, WidgetDataSource, WidgetWidth } from '@/lib/types'

interface NewWidget {
  type: WidgetType
  data_source: WidgetDataSource
  title: string
  width: WidgetWidth
}

const WIDGET_TYPES: { type: WidgetType; icon: React.ElementType; label: string; description: string }[] = [
  { type: 'metric', icon: Hash, label: 'Métrica', description: 'Exibe um número em destaque' },
  { type: 'line', icon: LineChart, label: 'Linha', description: 'Evolução ao longo do tempo' },
  { type: 'bar', icon: BarChart2, label: 'Barras', description: 'Comparação entre categorias' },
  { type: 'pie', icon: PieChart, label: 'Pizza', description: 'Proporção entre categorias' },
  { type: 'table', icon: Table2, label: 'Tabela', description: 'Lista detalhada de transações' },
]

const METRIC_SOURCES: { value: WidgetDataSource; label: string }[] = [
  { value: 'total_converted', label: 'Total Convertido (BRL)' },
  { value: 'total_brl', label: 'Faturamento BRL' },
  { value: 'total_usd', label: 'Faturamento USD' },
  { value: 'sales_count', label: 'Vendas Aprovadas' },
  { value: 'approval_rate', label: 'Taxa de Aprovação' },
  { value: 'avg_ticket', label: 'Ticket Médio' },
  { value: 'refunds_count', label: 'Reembolsos' },
  { value: 'pending_count', label: 'Pendentes' },
  { value: 'cancelled_count', label: 'Cancelados' },
]

const LINE_SOURCES: { value: WidgetDataSource; label: string }[] = [
  { value: 'revenue_by_day', label: 'Faturamento por Dia' },
  { value: 'sales_by_day', label: 'Vendas por Dia' },
  { value: 'revenue_by_product', label: 'Receita por Produto' },
  { value: 'count_by_product', label: 'Vendas por Produto' },
]

const BAR_SOURCES: { value: WidgetDataSource; label: string }[] = [
  { value: 'revenue_by_day', label: 'Faturamento por Dia' },
  { value: 'sales_by_day', label: 'Vendas por Dia' },
  { value: 'revenue_by_product', label: 'Receita por Produto' },
  { value: 'count_by_product', label: 'Vendas por Produto' },
  { value: 'by_payment', label: 'Por Forma de Pagamento' },
  { value: 'by_country', label: 'Por País' },
  { value: 'by_status', label: 'Por Status' },
]

const PIE_SOURCES: { value: WidgetDataSource; label: string }[] = [
  { value: 'by_payment', label: 'Por Forma de Pagamento' },
  { value: 'by_country', label: 'Por País' },
  { value: 'by_status', label: 'Por Status' },
  { value: 'count_by_product', label: 'Vendas por Produto' },
  { value: 'revenue_by_product', label: 'Receita por Produto' },
]

const TABLE_SOURCES: { value: WidgetDataSource; label: string }[] = [
  { value: 'transactions', label: 'Transações Detalhadas' },
]

function getSourcesForType(type: WidgetType) {
  switch (type) {
    case 'metric': return METRIC_SOURCES
    case 'line': return LINE_SOURCES
    case 'bar': return BAR_SOURCES
    case 'pie': return PIE_SOURCES
    case 'table': return TABLE_SOURCES
  }
}

function defaultWidth(type: WidgetType): WidgetWidth {
  return type === 'metric' ? 'half' : 'full'
}

export function AddWidgetModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  onAdd: (w: NewWidget) => Promise<void>
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedType, setSelectedType] = useState<WidgetType | null>(null)
  const [dataSource, setDataSource] = useState<WidgetDataSource | null>(null)
  const [title, setTitle] = useState('')
  const [width, setWidth] = useState<WidgetWidth>('half')
  const [saving, setSaving] = useState(false)

  function reset() {
    setStep(1)
    setSelectedType(null)
    setDataSource(null)
    setTitle('')
    setWidth('half')
  }

  function handleClose() {
    reset()
    onClose()
  }

  function selectType(type: WidgetType) {
    setSelectedType(type)
    setDataSource(null)
    setTitle('')
    setWidth(defaultWidth(type))
    setStep(2)
  }

  function selectSource(src: { value: WidgetDataSource; label: string }) {
    setDataSource(src.value)
    if (!title) setTitle(src.label)
  }

  async function handleCreate() {
    if (!selectedType || !dataSource) return
    setSaving(true)
    await onAdd({ type: selectedType, data_source: dataSource, title: title || 'Widget', width })
    setSaving(false)
    handleClose()
  }

  const sources = selectedType ? getSourcesForType(selectedType) : []

  return (
    <Modal open={open} onClose={handleClose} title="Adicionar Widget" maxWidth="max-w-lg">
      {step === 1 ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Escolha o tipo de visualização:</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {WIDGET_TYPES.map(({ type, icon: Icon, label, description }) => (
              <button
                key={type}
                onClick={() => selectType(type)}
                className="flex flex-col items-start gap-2 rounded-xl border border-white/8 bg-white/3 p-4 text-left transition-all hover:border-indigo-500/40 hover:bg-indigo-500/5"
              >
                <Icon size={20} className="text-indigo-400" />
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

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">Dado a exibir</p>
            <div className="max-h-52 space-y-1 overflow-y-auto">
              {sources.map(src => (
                <button
                  key={src.value}
                  onClick={() => selectSource(src)}
                  className={`w-full rounded-xl px-3 py-2.5 text-left text-sm transition-all ${
                    dataSource === src.value
                      ? 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  {src.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">Título do widget</p>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ex: Faturamento por Dia"
              className="w-full rounded-xl bg-white/5 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 outline-none ring-1 ring-white/8 focus:ring-indigo-500/50"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">Largura</p>
            <div className="flex gap-2">
              {(['half', 'full'] as WidgetWidth[]).map(w => (
                <button
                  key={w}
                  onClick={() => setWidth(w)}
                  className={`flex-1 rounded-xl py-2 text-sm font-medium transition-all ${
                    width === w
                      ? 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30'
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
            <Button
              className="flex-1"
              onClick={handleCreate}
              disabled={!dataSource || saving}
            >
              {saving ? 'Criando...' : 'Criar widget'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
