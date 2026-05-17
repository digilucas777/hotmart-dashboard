import Link from 'next/link'
import { ArrowRight, Bot, CheckCircle2, DatabaseZap, FileText, Gauge, Layers3, LockKeyhole, PlugZap, Sparkles, Workflow, Zap } from 'lucide-react'
import { DashboardMockup } from '@/components/saas/DashboardMockup'
import { FadeIn, MarketingPageShell } from '@/components/saas/MarketingShell'
import { PricingCards } from '@/components/saas/PricingCards'

const benefits = [
  { icon: Zap, title: 'Velocidade para decidir', text: 'Métricas importantes em tempo real para cortar achismo e acelerar decisões.' },
  { icon: FileText, title: 'Relatórios inteligentes', text: 'Resumos profissionais prontos para enviar a clientes e times.' },
  { icon: Layers3, title: 'Dashboards por cliente', text: 'Estrutura multi-tenant preparada para manter dados e layouts isolados.' },
  { icon: LockKeyhole, title: 'Dados protegidos', text: 'Base preparada com autenticação, sessão persistente e Row Level Security.' },
]

const automations = [
  'Envio recorrente de relatório executivo',
  'Alertas de queda em ROAS, CTR e faturamento',
  'Resumo automático de campanhas e criativos',
  'Templates prontos para agências e infoprodutores',
]

const integrations = ['Meta Ads', 'Google Ads', 'Hotmart', 'Kiwify', 'Shopify', 'WhatsApp API']

const testimonials = [
  ['“Finalmente um dashboard que parece apresentação premium, não planilha improvisada.”', 'Marina Costa', 'Gestora de tráfego'],
  ['“A agência ganhou velocidade para reportar performance sem montar slide toda semana.”', 'Rafael Nunes', 'Diretor de agência'],
  ['“O cliente entende os números em minutos. Isso muda a conversa de resultado.”', 'Bianca Prado', 'Social media'],
]

const faqs = [
  ['O Dash Speed já integra com anúncios?', 'A estrutura está preparada para Meta Ads, Google Ads e Business Manager. As integrações serão conectadas por etapas.'],
  ['Existe plano grátis?', 'Não. O foco é uma experiência premium para profissionais que entregam relatórios e dashboards a clientes.'],
  ['Posso ter vários dashboards?', 'Sim. Os planos foram pensados para 1, 3, 10 ou volumes personalizados de dashboards.'],
  ['Os dados ficam separados por usuário?', 'Sim. A arquitetura foi preparada para isolamento multi-tenant e políticas de RLS no Supabase.'],
]

export default function LandingPage() {
  return (
    <MarketingPageShell>
      <section className="px-4 pb-20 pt-32 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-14 lg:grid-cols-[0.9fr_1.1fr]">
            <FadeIn>
              <div>
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100">
                  <Sparkles size={15} />
                  SaaS premium para métricas, relatórios e clientes
                </div>
                <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-tight text-white sm:text-6xl lg:text-7xl">
                  Dados rápidos. Relatórios inteligentes.
                </h1>
                <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">
                  Automatize relatórios, acompanhe métricas em tempo real e entregue dashboards profissionais para seus clientes.
                </p>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <Link href="/register" className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-6 py-4 text-sm font-black text-white shadow-[0_0_42px_rgba(0,212,255,0.28)] transition-transform hover:-translate-y-0.5">
                    Começar agora
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                  </Link>
                  <a href="#demo" className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-4 text-sm font-black text-white transition-colors hover:bg-white/[0.08]">
                    Ver demonstração
                  </a>
                </div>
              </div>
            </FadeIn>
            <DashboardMockup />
          </div>
        </div>
      </section>

      <section id="demo" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <FadeIn>
            <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-8">
                <Gauge className="text-cyan-300" size={28} />
                <h2 className="mt-6 text-3xl font-black">Uma demonstração visual do seu centro de comando.</h2>
                <p className="mt-4 text-slate-400">Mostre receita, campanhas, funis, custos e resultados em uma interface que passa confiança desde o primeiro acesso.</p>
              </div>
              <div className="relative min-h-80 overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0d14] p-6">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(0,212,255,0.16),transparent_26rem)]" />
                <div className="relative flex h-full items-center justify-center rounded-3xl border border-white/10 bg-black/30">
                  <div className="text-center">
                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-cyan-400 to-violet-500">
                      <Zap size={26} />
                    </div>
                    <p className="text-xl font-black">Espaço para vídeo de apresentação</p>
                    <p className="mt-2 text-sm text-slate-500">Embed futuro do YouTube, Vimeo ou player próprio.</p>
                  </div>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      <section id="beneficios" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <FadeIn>
            <div className="max-w-2xl">
              <p className="text-sm font-black uppercase tracking-[0.24em] text-cyan-200/70">Benefícios</p>
              <h2 className="mt-3 text-4xl font-black">Feito para quem precisa provar resultado.</h2>
            </div>
          </FadeIn>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {benefits.map(({ icon: Icon, title, text }, index) => (
              <FadeIn key={title} delay={index * 0.05}>
                <div className="h-full rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                  <Icon size={24} className="text-cyan-300" />
                  <h3 className="mt-5 font-black text-white">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{text}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-2">
          <FadeIn>
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-8">
              <Bot size={28} className="text-violet-300" />
              <h2 className="mt-5 text-3xl font-black">Automações que economizam horas por semana.</h2>
              <div className="mt-8 space-y-3">
                {automations.map(item => (
                  <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
                    <CheckCircle2 size={17} className="text-cyan-300" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
          <FadeIn delay={0.08}>
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-8">
              <DatabaseZap size={28} className="text-cyan-300" />
              <h2 className="mt-5 text-3xl font-black">Dashboards editáveis para cada operação.</h2>
              <p className="mt-4 text-slate-400">Estrutura preparada para adicionar cards, mover widgets, redimensionar blocos e salvar layouts do usuário sem afetar outros clientes.</p>
              <div className="mt-8 grid grid-cols-2 gap-3">
                {['Cards', 'Widgets', 'Layouts', 'Clientes'].map(item => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-bold text-white">{item}</div>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      <section id="integracoes" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-8">
          <FadeIn>
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <PlugZap size={28} className="text-cyan-300" />
                <h2 className="mt-5 text-3xl font-black">Integrações futuras, arquitetura pronta.</h2>
                <p className="mt-3 max-w-2xl text-slate-400">Conecte fontes de dados essenciais para tráfego, vendas e atendimento.</p>
              </div>
              <Link href="/register" className="inline-flex items-center gap-2 text-sm font-black text-cyan-200 hover:text-white">
                Entrar na lista
                <ArrowRight size={15} />
              </Link>
            </div>
          </FadeIn>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {integrations.map((item, index) => (
              <FadeIn key={item} delay={index * 0.04}>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-5 text-center text-sm font-black text-white">{item}</div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <FadeIn>
            <div className="mb-10 max-w-2xl">
              <p className="text-sm font-black uppercase tracking-[0.24em] text-cyan-200/70">Planos</p>
              <h2 className="mt-3 text-4xl font-black">Escolha o tamanho da sua operação.</h2>
            </div>
          </FadeIn>
          <PricingCards />
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-4 lg:grid-cols-3">
            {testimonials.map(([quote, name, role], index) => (
              <FadeIn key={name} delay={index * 0.06}>
                <div className="h-full rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                  <p className="text-lg font-semibold leading-8 text-white">{quote}</p>
                  <div className="mt-8">
                    <p className="font-black">{name}</p>
                    <p className="text-sm text-slate-500">{role}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <FadeIn>
            <h2 className="text-center text-4xl font-black">Perguntas frequentes</h2>
          </FadeIn>
          <div className="mt-10 space-y-3">
            {faqs.map(([q, a], index) => (
              <FadeIn key={q} delay={index * 0.04}>
                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                  <h3 className="font-black text-white">{q}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{a}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <FadeIn>
          <div className="mx-auto max-w-5xl rounded-[2rem] border border-cyan-300/20 bg-[linear-gradient(135deg,rgba(0,212,255,0.12),rgba(167,139,250,0.12))] p-8 text-center shadow-[0_0_80px_rgba(0,212,255,0.12)] sm:p-12">
            <Workflow className="mx-auto text-cyan-200" size={34} />
            <h2 className="mt-6 text-4xl font-black">Transforme dados em uma experiência premium para seus clientes.</h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-300">Dash Speed foi desenhado para gestores, agências, infoprodutores e prestadores que querem reportar melhor e vender mais confiança.</p>
            <Link href="/register" className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-4 text-sm font-black text-[#07080d] transition-transform hover:-translate-y-0.5">
              Começar agora
              <ArrowRight size={16} />
            </Link>
          </div>
        </FadeIn>
      </section>
    </MarketingPageShell>
  )
}
