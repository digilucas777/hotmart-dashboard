import { FileText } from 'lucide-react'

export default function RelatoriosPage() {
  return (
    <div className="min-h-screen">
      <header
        className="border-b"
        style={{
          borderColor: 'rgba(255,255,255,0.07)',
          background: 'rgba(11,11,20,0.95)',
        }}
      >
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2.5 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20">
            <FileText size={15} className="text-indigo-400" />
          </div>
          <span className="text-sm font-bold text-slate-100">Relatórios</span>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-10">
        <div
          className="flex h-72 flex-col items-center justify-center rounded-2xl border border-dashed text-center"
          style={{ borderColor: 'rgba(255,255,255,0.12)' }}
        >
          <FileText size={40} className="mb-3 text-slate-700" />
          <p className="text-sm font-medium text-slate-500">Relatórios em desenvolvimento</p>
          <p className="mt-1 text-xs text-slate-700">
            Em breve você poderá exportar e visualizar relatórios detalhados.
          </p>
        </div>
      </main>
    </div>
  )
}
