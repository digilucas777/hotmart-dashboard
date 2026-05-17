import { MarketingPageShell } from '@/components/saas/MarketingShell'
import { PricingCards } from '@/components/saas/PricingCards'

export default function PricingPage() {
  return (
    <MarketingPageShell>
      <section className="px-4 pb-20 pt-32 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <p className="text-sm font-black uppercase tracking-[0.24em] text-cyan-200/70">Planos</p>
            <h1 className="mt-4 text-5xl font-black tracking-tight text-white">Planos premium para operações que crescem.</h1>
            <p className="mt-5 text-lg leading-8 text-slate-400">Sem plano grátis. Uma experiência limpa, profissional e preparada para assinatura mensal, upgrade, downgrade e billing futuro.</p>
          </div>
          <PricingCards />
        </div>
      </section>
    </MarketingPageShell>
  )
}
