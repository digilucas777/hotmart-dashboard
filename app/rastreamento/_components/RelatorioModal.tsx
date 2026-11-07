'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

// Relatório pronto pra colar no WhatsApp (só copiar, sem integração).
export function RelatorioModal({ open, onClose, texto }: { open: boolean; onClose: () => void; texto: string }) {
  const [copiado, setCopiado] = useState(false)
  const [falhou, setFalhou] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true); setFalhou(false)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setFalhou(true)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Relatório pro WhatsApp" maxWidth="max-w-lg">
      <div className="space-y-3">
        <textarea
          readOnly
          value={texto}
          onFocus={e => e.currentTarget.select()}
          className="h-[420px] w-full resize-none rounded-xl border border-white/10 bg-[#121221] p-3 font-mono text-[12px] leading-relaxed text-slate-200 outline-none"
        />
        {falhou && <p className="text-xs text-amber-300">O navegador não deixou copiar sozinho. Clique no texto, aperte Ctrl+A e depois Ctrl+C.</p>}
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Fechar</Button>
          <Button className="flex-1" onClick={() => void copiar()}>
            {copiado ? <Check size={14} /> : <Copy size={14} />}
            {copiado ? 'Copiado' : 'Copiar relatório'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
