'use client'

import { useState } from 'react'
import { Copy, Check, ScanSearch } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import type { TrackInstallation } from '@/lib/track/types'
import { buildFullHeadSnippet } from '@/lib/track/utmSnippet'

type Resultado = { domain: string; found: boolean; error?: string }

// Script da <head> + verificação se ele está nas páginas (antes ficava num
// "abre e fecha" dentro do cartão da instalação).
export function ScriptModal({ installation, onClose }: { installation: TrackInstallation | null; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false)
  const [url, setUrl] = useState('')
  const [checando, setChecando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultados, setResultados] = useState<Resultado[] | null>(null)

  const inst = installation
  function fechar() {
    setUrl(''); setErro(null); setResultados(null); setCopiado(false)
    onClose()
  }

  async function copiar() {
    if (!inst?.worker_subdomain) return
    const snippet = buildFullHeadSnippet(
      inst.worker_subdomain,
      inst.domains.filter(d => d.tipo === 'lp').map(d => d.domain),
      inst.domains.filter(d => d.tipo === 'checkout').map(d => d.domain),
    )
    try { await navigator.clipboard.writeText(snippet) } catch { return }
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  async function verificar() {
    if (!inst) return
    setChecando(true); setErro(null); setResultados(null)
    const res = await fetch('/api/track/installations/check-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: inst.id, url: url.trim() || undefined }),
    })
    const json = await res.json().catch(() => ({}))
    setChecando(false)
    if (!res.ok) { setErro(json?.error || 'Não foi possível verificar agora.'); return }
    setResultados(json.results ?? [])
  }

  return (
    <Modal open={!!inst} onClose={fechar} title="Script e verificação">
      {inst?.worker_subdomain && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">Cole na &lt;head&gt; de todas as páginas do funil.</p>
          <div className="flex items-center gap-2 rounded-xl p-3 ring-1 ring-white/10" style={{ background: '#111120' }}>
            <code className="flex-1 truncate text-[11px] text-cyan-300">
              {`<script src="https://${inst.worker_subdomain}/t.js"></script> + repasse de fbclid/UTM pro checkout`}
            </code>
            <button
              onClick={() => void copiar()}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-indigo-300 ring-1 ring-indigo-500/30 hover:bg-indigo-500/15"
            >
              {copiado ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-2.5 text-[11px] text-blue-200">
            Se já tem o pixel nativo da Meta na página, pode deixar: esse script carrega ele sozinho e junta tudo em 1 evento (nunca conta em dobro).
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2.5 text-[11px] text-amber-200">
            Já vem com o repasse de fbclid e UTM pro checkout. Importante se algum botão do funil (pressel ou cloaker) tem link fixo pro checkout, senão a venda não conta pro Facebook.
          </div>

          <div className="space-y-2 border-t border-white/10 pt-3">
            <p className="text-xs font-semibold text-slate-300">O script está nas páginas?</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="Opcional: URL de uma página específica"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs text-slate-300 placeholder-slate-600 outline-none focus:border-indigo-500/50"
              />
              <button
                onClick={() => void verificar()}
                disabled={checando}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-60"
              >
                {checando ? <Spinner size={12} /> : <ScanSearch size={13} />}
                Verificar
              </button>
            </div>
            <p className="text-[10.5px] text-slate-600">Sem URL, confere a página inicial de cada domínio cadastrado.</p>
            {erro && <p className="text-xs text-rose-300">{erro}</p>}
            {resultados && (
              <div className="space-y-1">
                {resultados.map(r => (
                  <p key={r.domain} className={`text-xs ${r.found ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {r.found ? '✅' : '⚠️'} {r.domain}: {r.found ? 'script encontrado' : r.error ? r.error : 'script não encontrado na página inicial'}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
