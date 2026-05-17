import {
  BarChart3,
  Boxes,
  CheckCircle2,
  Clock3,
  Image,
  Link2,
  MousePointerClick,
  Plug,
  ShieldCheck,
  Target,
  TrendingUp,
} from 'lucide-react'

const metaMetrics = [
  'Gasto total',
  'Impressões',
  'Alcance',
  'Frequência',
  'Cliques no link',
  'CTR',
  'CPC',
  'CPM',
  'Leads',
  'Custo por lead',
  'Conversões',
  'Custo por compra',
  'ROAS',
  'Receita atribuída',
]

const features = [
  {
    icon: Boxes,
    title: 'Múltiplas contas',
    text: 'Acesse várias contas de anúncios na mesma dashboard e visualize métricas consolidadas como gasto total, leads e receita.',
  },
  {
    icon: BarChart3,
    title: 'Funil Adaptável',
    text: 'Funil dinâmico para e-commerce, mensagens, infoproduto, cadastro e delivery, exibindo custo e taxa de conversão entre cada etapa.',
  },
  {
    icon: Link2,
    title: 'Rastreio de UTMs',
    text: 'Rastreie a origem das conversões e analise campanhas, conjuntos e anúncios que trouxeram mais resultado.',
  },
  {
    icon: Clock3,
    title: 'Atualizada em tempo real',
    text: 'Clientes entram na dashboard e acompanham as métricas sem depender de novos relatórios a cada real investido.',
  },
  {
    icon: Image,
    title: 'Imagem dos criativos',
    text: 'Exiba criativos destaque com CTR, custo por resultado, conversões e outras métricas escolhidas por você.',
  },
]

export default function IntegracoesPage() {
  return (
    <div className="min-h-screen bg-[var(--dash-bg)] text-[var(--dash-text)]">
      <header className="border-b border-[var(--dash-border)] bg-[var(--dash-panel-strong)]/90 backdrop-blur-2xl">
        <div className="mx-auto flex min-h-16 max-w-[1400px] flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-violet-500 text-white shadow-[0_0_28px_rgba(0,212,255,0.24)]">
              <Plug size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--dash-faint)]">Integrações</p>
              <h1 className="text-xl font-black">Meta Ads</h1>
            </div>
          </div>
          <button className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-5 py-3 text-sm font-black text-white shadow-[0_0_30px_rgba(0,212,255,0.2)]">
            <Plug size={16} />
            Conectar Meta
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-10">
        <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[2rem] border border-[var(--dash-border)] bg-[var(--dash-panel)] p-7 shadow-[var(--dash-shadow)]">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-200">
              <ShieldCheck size={14} />
              Estrutura OAuth preparada
            </div>
            <h2 className="text-3xl font-black">Conecte contas de anúncios, BMs e métricas do Meta Ads.</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--dash-muted)]">
              A tela está pronta para receber autenticação Meta, seleção de Business Manager, múltiplas contas de anúncios e sincronização de métricas em tempo real.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {['Business Manager', 'Contas de anúncios', 'Campanhas', 'Conjuntos', 'Anúncios', 'Criativos'].map(item => (
                <div key={item} className="flex items-center gap-2 rounded-2xl border border-[var(--dash-border)] bg-white/5 px-4 py-3 text-sm font-bold">
                  <CheckCircle2 size={15} className="text-cyan-300" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-[var(--dash-border)] bg-[var(--dash-panel)] p-7 shadow-[var(--dash-shadow)]">
            <div className="flex items-center gap-2 text-sm font-black text-cyan-200">
              <TrendingUp size={18} />
              Principais métricas Meta Ads
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
              {metaMetrics.map(metric => (
                <div key={metric} className="rounded-2xl border border-[var(--dash-border)] bg-white/5 px-4 py-3 text-sm font-semibold text-[var(--dash-text)]">
                  {metric}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-[1.6rem] border border-[var(--dash-border)] bg-[var(--dash-panel)] p-5 shadow-[var(--dash-shadow)]">
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20 text-cyan-300">
                <Icon size={20} />
              </div>
              <h3 className="font-black">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--dash-muted)]">{text}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 rounded-[2rem] border border-[var(--dash-border)] bg-[var(--dash-panel)] p-7 shadow-[var(--dash-shadow)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-black">Insights rápidos sem rolar colunas no gerenciador.</h2>
              <p className="mt-2 text-sm text-[var(--dash-muted)]">
                Próximo passo: salvar tokens Meta com segurança, listar BMs e contas, e liberar widgets por campanha/conjunto/anúncio.
              </p>
            </div>
            <div className="grid min-w-80 grid-cols-3 gap-3">
              {[
                [Target, 'CPA'],
                [MousePointerClick, 'CTR'],
                [TrendingUp, 'ROAS'],
              ].map(([Icon, label]) => {
                const MetricIcon = Icon as typeof Target
                return (
                  <div key={String(label)} className="rounded-2xl border border-[var(--dash-border)] bg-white/5 p-4 text-center">
                    <MetricIcon className="mx-auto text-cyan-300" size={20} />
                    <p className="mt-2 text-sm font-black">{String(label)}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
