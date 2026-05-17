'use client'

import Link from 'next/link'
import { Check, Sparkles } from 'lucide-react'
import { FadeIn } from './MarketingShell'

const plans = [
  {
    name: 'Starter',
    price: 'R$ 97',
    description: 'Para freelancers e operações enxutas.',
    dashboards: '1 dashboard',
    features: ['1 dashboard', 'Relatórios profissionais', 'Integrações essenciais', 'Suporte por e-mail'],
  },
  {
    name: 'Pro',
    price: 'R$ 197',
    description: 'Para gestores que precisam entregar mais.',
    dashboards: '3 dashboards',
    featured: true,
    features: ['3 dashboards', 'Automações de relatórios', 'Dashboards editáveis', 'Alertas inteligentes', 'Suporte prioritário'],
  },
  {
    name: 'Agency',
    price: 'R$ 497',
    description: 'Para agências com múltiplos clientes.',
    dashboards: '10 dashboards',
    features: ['10 dashboards', 'Gestão multi-cliente', 'Templates premium', 'Relatórios recorrentes', 'Onboarding assistido'],
  },
  {
    name: 'Enterprise',
    price: 'Sob consulta',
    description: 'Para operações com demandas avançadas.',
    dashboards: 'Dashboards sob medida',
    features: ['Limites personalizados', 'SLA dedicado', 'Arquitetura customizada', 'Suporte estratégico'],
  },
]

export function PricingCards() {
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      {plans.map((plan, index) => (
        <FadeIn key={plan.name} delay={index * 0.05}>
          <div
            className={`relative flex h-full flex-col overflow-hidden rounded-3xl border p-6 ${
              plan.featured
                ? 'border-cyan-300/40 bg-cyan-400/[0.08] shadow-[0_0_50px_rgba(0,212,255,0.18)]'
                : 'border-white/10 bg-white/[0.04]'
            }`}
          >
            {plan.featured && (
              <div className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 px-3 py-1 text-[11px] font-black text-white">
                <Sparkles size={12} />
                Mais escolhido
              </div>
            )}
            <p className="text-lg font-black text-white">{plan.name}</p>
            <p className="mt-2 text-sm text-slate-400">{plan.description}</p>
            <div className="mt-7">
              <span className="text-3xl font-black text-white">{plan.price}</span>
              {plan.price !== 'Sob consulta' && <span className="text-sm text-slate-500">/mês</span>}
            </div>
            <p className="mt-2 text-sm font-semibold text-cyan-200">{plan.dashboards}</p>
            <ul className="mt-7 flex flex-1 flex-col gap-3">
              {plan.features.map(feature => (
                <li key={feature} className="flex items-center gap-2 text-sm text-slate-300">
                  <Check size={15} className="text-cyan-300" />
                  {feature}
                </li>
              ))}
            </ul>
            <Link
              href="/register"
              className={`mt-8 inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-black transition-transform hover:-translate-y-0.5 ${
                plan.featured
                  ? 'bg-gradient-to-r from-cyan-400 to-violet-500 text-white shadow-[0_0_30px_rgba(0,212,255,0.25)]'
                  : 'border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]'
              }`}
            >
              Assinar
            </Link>
          </div>
        </FadeIn>
      ))}
    </div>
  )
}
