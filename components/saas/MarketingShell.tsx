'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Menu } from 'lucide-react'
import { DashSpeedLogo } from './DashSpeedLogo'

export function MarketingNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#07080d]/75 backdrop-blur-2xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Dash Speed">
          <DashSpeedLogo />
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-slate-400 md:flex">
          <Link href="/#beneficios" className="transition-colors hover:text-white">Benefícios</Link>
          <Link href="/#integracoes" className="transition-colors hover:text-white">Integrações</Link>
          <Link href="/#faq" className="transition-colors hover:text-white">FAQ</Link>
          <Link href="/pricing" className="transition-colors hover:text-white">Planos</Link>
        </nav>
        <div className="hidden items-center gap-3 sm:flex">
          <Link href="/login" className="rounded-full px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:text-white">
            Entrar
          </Link>
          <Link href="/register" className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 px-5 py-2.5 text-sm font-black text-white shadow-[0_0_28px_rgba(0,212,255,0.28)] transition-transform hover:-translate-y-0.5">
            Começar agora
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <Link href="/login" className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-slate-300 sm:hidden">
          <Menu size={18} />
        </Link>
      </div>
    </header>
  )
}

export function MarketingPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen overflow-hidden bg-[#07080d] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-10%] top-[-10%] h-[34rem] w-[34rem] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute right-[-8%] top-[12%] h-[30rem] w-[30rem] rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />
      </div>
      <MarketingNav />
      <main className="relative">{children}</main>
      <footer className="relative border-t border-white/10 px-4 py-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
          <DashSpeedLogo />
          <div className="flex flex-wrap gap-5">
            <Link href="/pricing" className="hover:text-white">Planos</Link>
            <Link href="/login" className="hover:text-white">Login</Link>
            <Link href="/register" className="hover:text-white">Cadastro</Link>
          </div>
          <p>© 2026 Dash Speed. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  )
}

export function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.55, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}
