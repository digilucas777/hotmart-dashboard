import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/app/api/meta/_utils'

type DomainRow = { domain: string; tipo: string }

// Busca a página (server-side, sem CORS) e confere se o <script> do Worker
// aparece no HTML puro. Não executa JS nem espera nada dinâmico — só
// funciona pra script colado direto no HTML (ou renderizado no servidor); um
// site 100% client-side que injeta o <script> via JS depois do load pode dar
// falso negativo aqui, por isso o aviso na UI é "não encontramos", não "não
// está instalado".
async function checkCandidates(candidates: string[], needle: string, label: string): Promise<{ domain: string; found: boolean; error?: string }> {
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RastreamentoCheck/1.0)' },
      })
      if (!res.ok) continue
      const html = await res.text()
      return { domain: label, found: html.includes(needle) }
    } catch {
      continue
    }
  }
  return { domain: label, found: false, error: 'não foi possível acessar essa página' }
}

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'módulo em teste — só administradores podem usar por enquanto' }, { status: 403 })
  }

  const { id, url } = await request.json().catch(() => ({})) as { id?: string; url?: string }
  if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })

  const { data: installation, error: fetchError } = await supabase
    .from('track_installations')
    .select('worker_subdomain, track_domains(*)')
    .eq('id', id)
    .single()
  if (fetchError || !installation) return NextResponse.json({ error: 'instalação não encontrada' }, { status: 404 })
  if (!installation.worker_subdomain) {
    return NextResponse.json({ error: 'defina o subdomínio do Worker antes de verificar' }, { status: 400 })
  }
  const needle = `${installation.worker_subdomain}/t.js`

  // Com "url" preenchida, checa só essa página específica (o usuário quer
  // conferir uma página em particular, não a home do domínio) — ignora a
  // lista de domínios cadastrados nesse caso.
  if (url && url.trim()) {
    let parsed: URL
    try {
      parsed = new URL(url.trim())
    } catch {
      return NextResponse.json({ error: 'URL inválida — cole a URL completa (com https://)' }, { status: 400 })
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return NextResponse.json({ error: 'a URL precisa começar com http:// ou https://' }, { status: 400 })
    }
    const result = await checkCandidates([parsed.toString()], needle, parsed.toString())
    return NextResponse.json({ results: [result] })
  }

  const lpDomains = ((installation.track_domains ?? []) as DomainRow[])
    .filter(d => d.tipo === 'lp')
    .map(d => d.domain)
  if (lpDomains.length === 0) {
    return NextResponse.json({ error: 'cadastre ao menos um domínio (ou cole uma URL específica) antes de verificar' }, { status: 400 })
  }

  const results = await Promise.all(
    lpDomains.map(domain => checkCandidates([`https://${domain}/`, `http://${domain}/`], needle, domain)),
  )
  return NextResponse.json({ results })
}
