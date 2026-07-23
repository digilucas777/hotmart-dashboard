'use client'

import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'

const STORAGE_KEY = 'track_help_guide_checked_v1'

type Step = { id: string; text: string; links?: { label: string; url: string }[] }
type Part = { title: string; steps: Step[] }

const PARTS: Part[] = [
  {
    title: 'Parte A — Conta e domínio na Cloudflare',
    steps: [
      {
        id: 'a1',
        text: 'Crie uma conta gratuita na Cloudflare e confirme seu e-mail.',
        links: [{ label: 'Criar conta', url: 'https://dash.cloudflare.com/sign-up' }],
      },
      {
        id: 'a2',
        text: 'No painel, clique em "Add a site", digite o domínio que vai usar pro rastreamento e escolha o plano Free. Confira se todos os registros DNS existentes foram importados — principalmente MX/TXT de e-mail, se o domínio já for usado. Deixe o registro principal (@ e www) como "DNS only" (nuvem cinza) pra não alterar o site.',
      },
      {
        id: 'a3',
        text: 'Troque os nameservers do domínio (no painel da sua hospedagem/registro) pelos 2 que a Cloudflare mostrar. A propagação leva de minutos a algumas horas — quando o domínio aparecer como "Active" na Cloudflare, está pronto.',
      },
    ],
  },
  {
    title: 'Parte B — Token de API da Cloudflare',
    steps: [
      {
        id: 'b1',
        text: 'Crie um token custom com as permissões: Workers Scripts (Edit), Workers Observability (Read), Zone → DNS (Edit, na zona do seu domínio) e Workers KV Storage (Edit).',
        links: [{ label: 'Criar token', url: 'https://dash.cloudflare.com/profile/api-tokens' }],
      },
      {
        id: 'b2',
        text: 'Copie o token (só aparece uma vez) — ele vai colado na seção 1 do formulário "Nova instalação" aqui no dashboard.',
      },
    ],
  },
  {
    title: 'Parte C — Dados do Meta',
    steps: [
      {
        id: 'c1',
        text: 'No Gerenciador de Eventos, selecione seu Pixel — o ID é o número exibido.',
        links: [{ label: 'Gerenciador de Eventos', url: 'https://business.facebook.com' }],
      },
      {
        id: 'c2',
        text: 'Com o Pixel selecionado, vá em Configurações → Conversions API → "Gerar token de acesso". Copie e guarde com cuidado.',
      },
      {
        id: 'c3',
        text: 'Na aba "Testar eventos", copie o código de teste (opcional) — com ele os eventos aparecem ao vivo, deduplicados. Lembre de apagar esse código quando for pra produção.',
      },
    ],
  },
  {
    title: 'Parte D — Preencher a instalação aqui no dashboard',
    steps: [
      { id: 'd1', text: 'Clique em "Nova instalação" e cole o token da Cloudflare na seção 1.' },
      { id: 'd2', text: 'Na seção 2: dê um nome, defina o subdomínio do Worker (ex: sinal.seudominio.com), adicione o(s) pixel(s) com o token da CAPI, e liste os domínios das suas LPs.' },
      { id: 'd3', text: 'Na seção 4, ative o webhook de compra, o enriquecimento de sessão (se quiser) e informe os domínios de checkout (ex: pay.hotmart.com, go.hotmart.com). Salve.' },
    ],
  },
  {
    title: 'Parte E — Snippet e webhook (próximas etapas)',
    steps: [
      { id: 'e1', text: 'Depois que o Worker existir (Etapa 2), copie o snippet gerado e cole na <head> das suas páginas de vendas.' },
      { id: 'e2', text: 'Configure o webhook na Hotmart (Ferramentas → Webhook → Cadastrar Webhook) com a URL mostrada na edição da instalação, evento "Compra Aprovada".' },
    ],
  },
  {
    title: 'Parte F — Testar',
    steps: [
      { id: 'f1', text: 'Com o código de teste preenchido, acesse sua LP e confira no Gerenciador de Eventos → Testar Eventos se o PageView aparece.' },
      { id: 'f2', text: 'Faça uma compra de teste — confira se o Purchase aparece com os dados do comprador e fbp/fbc cruzados.' },
      { id: 'f3', text: 'Remova o código de teste antes de ir pra produção.' },
    ],
  },
]

function loadChecked(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function HelpGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (open) setChecked(loadChecked())
  }, [open])

  function toggle(id: string) {
    setChecked(prev => {
      const next = { ...prev, [id]: !prev[id] }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const total = PARTS.reduce((sum, p) => sum + p.steps.length, 0)
  const done = Object.values(checked).filter(Boolean).length

  return (
    <Modal open={open} onClose={onClose} title="Como configurar o rastreamento" maxWidth="max-w-2xl">
      <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1">
        <p className="text-xs text-slate-500">
          Passo a passo completo pra deixar o rastreamento funcionando de ponta a ponta. Marque conforme for fazendo — fica salvo só neste navegador. {done}/{total} concluídos.
        </p>
        {PARTS.map(part => (
          <section key={part.title}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{part.title}</h3>
            <div className="space-y-2">
              {part.steps.map(step => (
                <label key={step.id} className="flex items-start gap-2.5 rounded-xl p-2.5 ring-1 ring-white/5 hover:ring-white/10">
                  <input
                    type="checkbox"
                    checked={!!checked[step.id]}
                    onChange={() => toggle(step.id)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded"
                  />
                  <span className={`text-sm ${checked[step.id] ? 'text-slate-600 line-through' : 'text-slate-300'}`}>
                    {step.text}
                    {step.links?.map(link => (
                      <a
                        key={link.url}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-1.5 inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
                      >
                        {link.label} <ExternalLink size={11} />
                      </a>
                    ))}
                  </span>
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  )
}
