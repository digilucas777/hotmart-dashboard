'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Rocket, Copy, Check } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import type { TrackDomainTipo, TrackInstallation, TrackTriggerTipo } from '@/lib/track/types'

const META_EVENTS = [
  'PageView', 'ViewContent', 'Lead', 'Contact', 'InitiateCheckout', 'AddToCart',
  'Purchase', 'CompleteRegistration', 'Subscribe', 'Search', 'Custom',
]

const TRIGGER_TIPOS: { value: TrackTriggerTipo; label: string }[] = [
  { value: 'scroll', label: 'Rolagem de página' },
  { value: 'form_submit', label: 'Envio de formulário' },
  { value: 'click_link', label: 'Clique em link' },
  { value: 'click_element', label: 'Clique em elemento' },
  { value: 'url_visited', label: 'URL visitada' },
  { value: 'time_on_page', label: 'Tempo na página' },
  { value: 'video_progress', label: 'Progresso de vídeo' },
]

const SESSION_TTL_OPTIONS = [7, 14, 30]

let keyCounter = 0
function nextKey() {
  keyCounter += 1
  return `k${keyCounter}`
}

type PixelForm = { _key: string; id?: string; pixel_id: string; capi_token: string; hasToken: boolean; test_event_code: string }
type DomainForm = { _key: string; id?: string; domain: string; tipo: TrackDomainTipo }
type TriggerForm = { _key: string; id?: string; tipo: TrackTriggerTipo; meta_event: string; config: Record<string, unknown>; ativo: boolean }

function emptyPixel(): PixelForm {
  return { _key: nextKey(), pixel_id: '', capi_token: '', hasToken: false, test_event_code: '' }
}
function emptyDomain(tipo: TrackDomainTipo): DomainForm {
  return { _key: nextKey(), domain: '', tipo }
}
function emptyTrigger(): TriggerForm {
  return { _key: nextKey(), tipo: 'click_link', meta_event: 'Lead', config: {}, ativo: true }
}

const inputClass = 'w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none ring-1 ring-white/10 focus:ring-indigo-500/60'
const inputStyle = { background: '#111120' }
const labelClass = 'mb-1.5 block text-xs font-medium text-slate-500'

function EventPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {META_EVENTS.map(ev => (
        <button
          key={ev}
          type="button"
          onClick={() => onChange(ev)}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
            value === ev ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:bg-white/10'
          }`}
          style={value === ev ? undefined : { background: 'rgba(255,255,255,0.06)' }}
        >
          {ev}
        </button>
      ))}
    </div>
  )
}

function SectionHeader({ number, title }: { number: number; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5 border-b border-white/10 pb-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-300">
        {number}
      </span>
      <h3 className="text-sm font-bold text-slate-100">{title}</h3>
    </div>
  )
}

function DomainList({ label, placeholder, items, onChange, help }: {
  label: string
  placeholder: string
  items: DomainForm[]
  onChange: (items: DomainForm[]) => void
  help?: string
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="space-y-2">
        {items.map(d => (
          <div key={d._key} className="flex gap-2">
            <input
              type="text"
              value={d.domain}
              onChange={e => onChange(items.map(x => (x._key === d._key ? { ...x, domain: e.target.value } : x)))}
              placeholder={placeholder}
              className={`${inputClass} flex-1`}
              style={inputStyle}
            />
            <button
              onClick={() => onChange(items.filter(x => x._key !== d._key))}
              className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-red-500/15 hover:text-red-400"
              title="Remover domínio"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <button onClick={() => onChange([...items, emptyDomain(items[0]?.tipo ?? 'lp')])} className="mt-2 flex items-center gap-1.5 text-[11px] text-indigo-400 hover:text-indigo-300">
        <Plus size={12} /> Adicionar domínio
      </button>
      {help && <p className="mt-1 text-[11px] text-slate-600">{help}</p>}
    </div>
  )
}

interface InstallationModalProps {
  open: boolean
  installation: TrackInstallation | null
  onClose: () => void
  onSaved: (installation: TrackInstallation) => void
  onDeployed: () => void
}

export function InstallationModal({ open, installation, onClose, onSaved, onDeployed }: InstallationModalProps) {
  const [nome, setNome] = useState('')
  const [workerSubdomain, setWorkerSubdomain] = useState('')
  const [cloudflareToken, setCloudflareToken] = useState('')
  const [hasCloudflareToken, setHasCloudflareToken] = useState(false)
  const [pixels, setPixels] = useState<PixelForm[]>([emptyPixel()])
  const [lpDomains, setLpDomains] = useState<DomainForm[]>([emptyDomain('lp')])
  const [checkoutDomains, setCheckoutDomains] = useState<DomainForm[]>([])
  const [triggers, setTriggers] = useState<TriggerForm[]>([])
  const [webhookMetaEvent, setWebhookMetaEvent] = useState('Purchase')
  const [sessionEnrichment, setSessionEnrichment] = useState(false)
  const [sessionTtlDays, setSessionTtlDays] = useState(7)
  const [diagnostico, setDiagnostico] = useState(false)
  const [requireTrackerSrc, setRequireTrackerSrc] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deploying, setDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)
  const [copiedScript, setCopiedScript] = useState(false)

  async function handleCopyScript(snippet: string) {
    await navigator.clipboard.writeText(snippet)
    setCopiedScript(true)
    setTimeout(() => setCopiedScript(false), 2000)
  }

  useEffect(() => {
    if (!open) return
    if (installation) {
      setNome(installation.nome)
      setWorkerSubdomain(installation.worker_subdomain ?? '')
      setCloudflareToken('')
      setHasCloudflareToken(!!installation.cloudflare_api_token_masked)
      setPixels(installation.pixels.length > 0
        ? installation.pixels.map(p => ({
            _key: nextKey(), id: p.id, pixel_id: p.pixel_id, capi_token: '',
            hasToken: !!p.capi_token_masked, test_event_code: p.test_event_code ?? '',
          }))
        : [emptyPixel()])
      const lp = installation.domains.filter(d => d.tipo === 'lp')
      const checkout = installation.domains.filter(d => d.tipo === 'checkout')
      setLpDomains(lp.length > 0
        ? lp.map(d => ({ _key: nextKey(), id: d.id, domain: d.domain, tipo: d.tipo }))
        : [emptyDomain('lp')])
      setCheckoutDomains(checkout.map(d => ({ _key: nextKey(), id: d.id, domain: d.domain, tipo: d.tipo })))
      setTriggers(installation.triggers.map(t => ({ _key: nextKey(), id: t.id, tipo: t.tipo, meta_event: t.meta_event, config: t.config, ativo: t.ativo })))
      setWebhookMetaEvent(installation.webhook_meta_event)
      setSessionEnrichment(installation.session_enrichment_enabled)
      setSessionTtlDays(installation.session_ttl_days)
      setDiagnostico(installation.diagnostico_ativo)
      setRequireTrackerSrc(installation.require_tracker_src)
    } else {
      setNome('')
      setWorkerSubdomain('')
      setCloudflareToken('')
      setHasCloudflareToken(false)
      setPixels([emptyPixel()])
      setLpDomains([emptyDomain('lp')])
      setCheckoutDomains([])
      setTriggers([])
      setWebhookMetaEvent('Purchase')
      setSessionEnrichment(false)
      setSessionTtlDays(7)
      setDiagnostico(false)
      setRequireTrackerSrc(false)
    }
    setError(null)
  }, [open, installation])

  function updatePixel(key: string, patch: Partial<PixelForm>) {
    setPixels(prev => prev.map(p => (p._key === key ? { ...p, ...patch } : p)))
  }
  function updateTrigger(key: string, patch: Partial<TriggerForm>) {
    setTriggers(prev => prev.map(t => (t._key === key ? { ...t, ...patch } : t)))
  }

  async function saveInstallation(): Promise<TrackInstallation | null> {
    if (!nome.trim()) { setError('Dê um nome pra instalação.'); return null }
    const validPixels = pixels.filter(p => p.pixel_id.trim())
    const validDomains = [
      ...lpDomains.filter(d => d.domain.trim()).map(d => ({ ...d, tipo: 'lp' as const })),
      ...checkoutDomains.filter(d => d.domain.trim()).map(d => ({ ...d, tipo: 'checkout' as const })),
    ]

    const res = await fetch('/api/track/installations/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: installation?.id,
        nome: nome.trim(),
        worker_subdomain: workerSubdomain.trim() || null,
        cloudflare_api_token: cloudflareToken.trim() || undefined,
        webhook_meta_event: webhookMetaEvent,
        session_enrichment_enabled: sessionEnrichment,
        session_ttl_days: sessionTtlDays,
        diagnostico_ativo: diagnostico,
        require_tracker_src: requireTrackerSrc,
        pixels: validPixels.map(p => ({
          id: p.id,
          pixel_id: p.pixel_id.trim(),
          capi_token: p.capi_token.trim() || undefined,
          test_event_code: p.test_event_code.trim() || null,
        })),
        domains: validDomains.map(d => ({ id: d.id, domain: d.domain.trim(), tipo: d.tipo })),
        triggers: triggers.map(t => ({ id: t.id, tipo: t.tipo, meta_event: t.meta_event, config: t.config, ativo: t.ativo })),
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(json?.error || 'Não foi possível salvar.')
      return null
    }
    return json.installation as TrackInstallation
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const saved = await saveInstallation()
      if (saved) onSaved(saved)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeploy() {
    setDeploying(true)
    setDeployError(null)
    setError(null)
    try {
      // Publica sempre a versão mais recente do formulário — salva primeiro,
      // pra não exigir um "Salvar" manual antes de cada deploy.
      const saved = await saveInstallation()
      if (!saved) return

      const res = await fetch('/api/track/installations/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: saved.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setDeployError(json?.error || 'Não foi possível publicar o Worker.')
        return
      }
      onDeployed()
    } finally {
      setDeploying(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={installation ? 'Editar instalação' : 'Nova instalação'} maxWidth="max-w-2xl">
      <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1">
        {(error || deployError) && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
            {error || deployError}
          </div>
        )}

        {/* Seção 1 — Cloudflare */}
        <section>
          <SectionHeader number={1} title="Conectar Cloudflare" />
          <label className={labelClass}>Cloudflare API Token</label>
          <input
            type="password"
            value={cloudflareToken}
            onChange={e => setCloudflareToken(e.target.value)}
            placeholder={hasCloudflareToken ? '•••• já salvo — deixe em branco pra manter' : 'Cole aqui o token gerado na Cloudflare'}
            className={inputClass}
            style={inputStyle}
          />
          <p className="mt-1 text-[11px] text-slate-600">
            Nesta etapa o token só é salvo (criptografado) — a conexão real com a Cloudflare acontece numa etapa futura.{' '}
            <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300">
              Como criar o token
            </a>
          </p>
        </section>

        {/* Seção 2 — Config & plataformas */}
        <section className="space-y-4">
          <SectionHeader number={2} title="Configuração & plataformas" />
          <div>
            <label className={labelClass}>Nome da instalação *</label>
            <input autoFocus type="text" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Massagem tântrica ES" className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className={labelClass}>Subdomínio do Worker</label>
            <input type="text" value={workerSubdomain} onChange={e => setWorkerSubdomain(e.target.value)} placeholder="sinal.seudominio.com" className={inputClass} style={inputStyle} />
          </div>

          <div>
            <label className={labelClass}>Pixels do Meta</label>
            <div className="space-y-2">
              {pixels.map(p => (
                <div key={p._key} className="rounded-xl p-3 ring-1 ring-white/10" style={inputStyle}>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={p.pixel_id}
                      onChange={e => updatePixel(p._key, { pixel_id: e.target.value })}
                      placeholder="ID do pixel"
                      className={`${inputClass} flex-1`}
                      style={{ background: '#0b0b14' }}
                    />
                    <button onClick={() => setPixels(prev => prev.filter(x => x._key !== p._key))} className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-red-500/15 hover:text-red-400" title="Remover pixel">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input
                      type="password"
                      value={p.capi_token}
                      onChange={e => updatePixel(p._key, { capi_token: e.target.value })}
                      placeholder={p.hasToken ? '•••• já salvo — manter' : 'Token da CAPI (opcional)'}
                      className={inputClass}
                      style={{ background: '#0b0b14' }}
                    />
                    <input
                      type="text"
                      value={p.test_event_code}
                      onChange={e => updatePixel(p._key, { test_event_code: e.target.value })}
                      placeholder="Código de teste (debug)"
                      className={inputClass}
                      style={{ background: '#0b0b14' }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setPixels(prev => [...prev, emptyPixel()])} className="mt-2 flex items-center gap-1.5 text-[11px] text-indigo-400 hover:text-indigo-300">
              <Plus size={12} /> Adicionar pixel
            </button>
          </div>

          <DomainList
            label="Domínios que enviam tráfego"
            placeholder="minhalp.com.br"
            items={lpDomains}
            onChange={setLpDomains}
            help="Domínios das LPs que vão disparar eventos pro worker (allowlist de origem)."
          />

          {workerSubdomain.trim() && (
            <div className="rounded-xl p-3 ring-1 ring-white/10" style={inputStyle}>
              <p className={labelClass}>Script pra colar na &lt;head&gt; da página</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate text-xs text-cyan-300">
                  {`<script src="https://${workerSubdomain.trim()}/t.js"></script>`}
                </code>
                <button
                  onClick={() => handleCopyScript(`<script src="https://${workerSubdomain.trim()}/t.js"></script>`)}
                  className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
                  title={copiedScript ? 'Copiado!' : 'Copiar'}
                >
                  {copiedScript ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                </button>
              </div>
              <div className="mt-2 flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-[11px] text-amber-200">
                <span>⚠️</span>
                <p>
                  Se você já tem o pixel da Meta instalado direto na página, <strong>remova-o</strong> e deixe só
                  esse script — os dois juntos disparam <code>PageView</code> em dobro (um pelo navegador da
                  pessoa, sujeito a bloqueio, outro pelo nosso servidor).
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Diagnóstico — bloco solto, mesma posição da ferramenta de referência */}
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={diagnostico} onChange={e => setDiagnostico(e.target.checked)} className="h-4 w-4 rounded" />
          Diagnóstico (debug) — guarda amostra do payload cru de cada evento
        </label>

        <div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={requireTrackerSrc}
              onChange={e => setRequireTrackerSrc(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            Só manda Purchase pra Meta se o link de checkout tiver "-tracker" no src
          </label>
          <p className="mt-1 ml-6 text-xs text-slate-500">
            Ative se o mesmo produto da Hotmart também for vendido por outro pixel/campanha fora
            desse funil — sem isso, toda venda aprovada do produto (de qualquer origem) seria
            atribuída a essa instalação.
          </p>
        </div>

        {/* Seção 3 — Eventos (gatilhos) */}
        <section>
          <SectionHeader number={3} title="Eventos (opcional)" />
          <div className="space-y-2">
            {triggers.map(t => (
              <div key={t._key} className="rounded-xl p-3 ring-1 ring-white/10" style={inputStyle}>
                <div className="mb-2 flex items-center justify-between">
                  <select
                    value={t.tipo}
                    onChange={e => updateTrigger(t._key, { tipo: e.target.value as TrackTriggerTipo, config: {} })}
                    className={inputClass}
                    style={{ background: '#0b0b14' }}
                  >
                    {TRIGGER_TIPOS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                  <div className="ml-2 flex shrink-0 items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-slate-400">
                      <input type="checkbox" checked={t.ativo} onChange={e => updateTrigger(t._key, { ativo: e.target.checked })} className="h-4 w-4 rounded" />
                      Ativo
                    </label>
                    <button onClick={() => setTriggers(prev => prev.filter(x => x._key !== t._key))} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/15 hover:text-red-400" title="Remover gatilho">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <TriggerConfigFields trigger={t} onChange={config => updateTrigger(t._key, { config })} />
                <div className="mt-2">
                  <p className={labelClass}>Evento Meta a disparar</p>
                  <EventPicker value={t.meta_event} onChange={v => updateTrigger(t._key, { meta_event: v })} />
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setTriggers(prev => [...prev, emptyTrigger()])} className="mt-2 flex items-center gap-1.5 text-[11px] text-indigo-400 hover:text-indigo-300">
            <Plus size={12} /> Adicionar gatilho
          </button>
        </section>

        {/* Seção 4 — Webhook de compra */}
        <section className="space-y-3">
          <SectionHeader number={4} title="Webhook de compra" />

          <div className="flex gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
            <span>⚠️</span>
            <p>
              Antes de ativar: vá em <strong>Hotmart → seu produto → Pixels de Rastreamento</strong> e
              desmarque o evento <strong>Purchase</strong>, deixando só <strong>InitiateCheckout</strong> marcado.
              Sem isso, a venda é contada em dobro na Meta (uma vez pelo pixel nativo da Hotmart, outra pela
              nossa integração).
            </p>
          </div>

          <div>
            <label className={labelClass}>Plataforma</label>
            <input type="text" value="Hotmart" disabled className={`${inputClass} opacity-60`} style={inputStyle} />
          </div>
          <div>
            <label className={labelClass}>Evento Meta a disparar</label>
            <EventPicker value={webhookMetaEvent} onChange={setWebhookMetaEvent} />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={sessionEnrichment}
              onChange={e => {
                const checked = e.target.checked
                setSessionEnrichment(checked)
                if (checked && checkoutDomains.length === 0) {
                  setCheckoutDomains([
                    { _key: nextKey(), domain: 'pay.hotmart.com', tipo: 'checkout' },
                    { _key: nextKey(), domain: 'go.hotmart.com', tipo: 'checkout' },
                  ])
                }
              }}
              className="h-4 w-4 rounded"
            />
            Enriquecer com dados de sessão (geo, IP, fbp, fbc)
          </label>
          <p className="text-[11px] text-slate-600">
            Só tem efeito no Purchase se algum gatilho de formulário (seção 3) capturar o e-mail da pessoa
            <strong> antes</strong> dela ir pro checkout. Se seu funil vai direto pro checkout da Hotmart sem
            passar por um formulário seu, pode deixar ligado — só não vai ter o que cruzar ainda.
          </p>
          {sessionEnrichment && (
            <div className="space-y-4 rounded-xl p-3 ring-1 ring-white/10" style={inputStyle}>
              <DomainList
                label="Domínios de checkout"
                placeholder="pay.hotmart.com"
                items={checkoutDomains}
                onChange={setCheckoutDomains}
                help="Ex: pay.hotmart.com, go.hotmart.com — onde a pessoa finaliza a compra."
              />
              <div>
                <label className={labelClass}>Validade da sessão</label>
                <select value={sessionTtlDays} onChange={e => setSessionTtlDays(Number(e.target.value))} className={inputClass} style={{ background: '#0b0b14' }}>
                  {SESSION_TTL_OPTIONS.map(d => <option key={d} value={d}>{d} dias</option>)}
                </select>
              </div>
            </div>
          )}

          {installation && (
            <div className="rounded-xl p-3 ring-1 ring-white/10" style={inputStyle}>
              <p className={labelClass}>URL do webhook</p>
              <code className="block truncate text-xs text-cyan-300">{installation.webhook_url ?? 'defina o subdomínio do worker pra gerar a URL'}</code>
            </div>
          )}
          {!installation && (
            <p className="text-[11px] text-slate-600">A URL e o secret do webhook são gerados depois de salvar pela primeira vez.</p>
          )}
        </section>
      </div>

      <div className="flex gap-2 pt-4">
        <Button variant="ghost" className="flex-1" onClick={onClose}>Fechar</Button>
        <Button className="flex-1" onClick={handleSave} disabled={!nome.trim() || saving}>
          {saving && <Spinner size={14} />}
          Salvar
        </Button>
        {installation && (
          <Button
            className="flex-1 text-white"
            style={{ background: 'linear-gradient(135deg, #f97316, #ef4444)' }}
            onClick={handleDeploy}
            disabled={saving || deploying}
          >
            {deploying ? <Spinner size={14} /> : <Rocket size={14} />}
            Fazer deploy
          </Button>
        )}
      </div>
    </Modal>
  )
}

function TriggerConfigFields({ trigger, onChange }: { trigger: TriggerForm; onChange: (config: Record<string, unknown>) => void }) {
  const c = trigger.config
  const fieldClass = `${inputClass} mt-2`

  if (trigger.tipo === 'click_link' || trigger.tipo === 'click_element') {
    return (
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={(c.filtro as string) ?? ''}
          onChange={e => onChange({ ...c, filtro: e.target.value })}
          placeholder={trigger.tipo === 'click_link' ? 'Link contém (ex: wa.me)' : 'Seletor CSS do elemento'}
          className={inputClass}
          style={{ background: '#0b0b14' }}
        />
        <select
          value={(c.repeticao as string) ?? 'once_per_page'}
          onChange={e => onChange({ ...c, repeticao: e.target.value })}
          className={inputClass}
          style={{ background: '#0b0b14' }}
        >
          <option value="once_per_page">Uma vez por página</option>
          <option value="once_per_session">Uma vez por sessão</option>
          <option value="always">Sempre</option>
        </select>
      </div>
    )
  }

  if (trigger.tipo === 'scroll') {
    return (
      <input
        type="number"
        min={1}
        max={100}
        value={(c.porcentagem as number) ?? 50}
        onChange={e => onChange({ ...c, porcentagem: Number(e.target.value) })}
        placeholder="% de rolagem (ex: 50)"
        className={fieldClass}
        style={{ background: '#0b0b14' }}
      />
    )
  }

  if (trigger.tipo === 'time_on_page') {
    return (
      <input
        type="number"
        min={1}
        value={(c.segundos as number) ?? 30}
        onChange={e => onChange({ ...c, segundos: Number(e.target.value) })}
        placeholder="Segundos na página (ex: 30)"
        className={fieldClass}
        style={{ background: '#0b0b14' }}
      />
    )
  }

  if (trigger.tipo === 'url_visited') {
    return (
      <input
        type="text"
        value={(c.contem as string) ?? ''}
        onChange={e => onChange({ ...c, contem: e.target.value })}
        placeholder="URL contém (ex: /obrigado)"
        className={fieldClass}
        style={{ background: '#0b0b14' }}
      />
    )
  }

  if (trigger.tipo === 'video_progress') {
    return (
      <div className="grid grid-cols-2 gap-2">
        <select
          value={(c.modo as string) ?? 'auto'}
          onChange={e => onChange({ ...c, modo: e.target.value })}
          className={inputClass}
          style={{ background: '#0b0b14' }}
        >
          <option value="auto">Auto-detectar</option>
          <option value="html5">Vídeo HTML5</option>
          <option value="vturb">VTURB</option>
        </select>
        <input
          type="text"
          value={(c.percentuais as string) ?? '25,50,75,100'}
          onChange={e => onChange({ ...c, percentuais: e.target.value })}
          placeholder="Percentuais (ex: 25,50,75,100)"
          className={inputClass}
          style={{ background: '#0b0b14' }}
        />
      </div>
    )
  }

  return <p className="text-[11px] text-slate-600">Detecta automaticamente os campos nome/e-mail/telefone do formulário.</p>
}
