const CF_API = 'https://api.cloudflare.com/client/v4'

type CfError = { code: number; message: string }
type CfResult<T> = { success: boolean; result: T; errors: CfError[] }

async function cfFetch<T>(path: string, token: string, init?: RequestInit): Promise<CfResult<T>> {
  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
  return res.json() as Promise<CfResult<T>>
}

export async function verifyToken(token: string): Promise<{ ok: boolean; error?: string }> {
  const result = await cfFetch<{ status: string }>('/user/tokens/verify', token)
  if (!result.success) return { ok: false, error: result.errors?.[0]?.message ?? 'token inválido' }
  return { ok: result.result?.status === 'active' }
}

export async function getAccountId(token: string): Promise<string> {
  const result = await cfFetch<{ id: string; name: string }[]>('/accounts', token)
  if (!result.success || !result.result?.[0]) {
    throw new Error(result.errors?.[0]?.message ?? 'não foi possível listar contas Cloudflare — confira as permissões do token')
  }
  return result.result[0].id
}

export async function getZoneId(token: string, domain: string): Promise<string | null> {
  const result = await cfFetch<{ id: string }[]>(`/zones?name=${encodeURIComponent(domain)}`, token)
  if (!result.success || !result.result?.[0]) return null
  return result.result[0].id
}

// Nameservers que a Cloudflare desta conta pede pro domínio x os que estão de
// fato no registro do domínio (DNS público). A Cloudflare define o par por conta
// e pode trocar (domínio removido e adicionado de novo, ou adicionado em outra
// conta): com o par errado a zona fica "pendente" e o robô não publica.
export async function checkZoneNameservers(token: string, zoneId: string, domain: string): Promise<{ ok: boolean; status: string; esperados: string[]; atuais: string[] }> {
  const z = await cfFetch<{ status: string; name_servers: string[] }>(`/zones/${zoneId}`, token)
  const status = String(z.result?.status ?? '')
  const esperados = (z.result?.name_servers ?? []).map(n => n.toLowerCase())
  let atuais: string[] = []
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=NS`, {
      headers: { accept: 'application/dns-json' }, cache: 'no-store', signal: AbortSignal.timeout(5000),
    })
    const j = await r.json() as { Answer?: { type: number; data: string }[] }
    atuais = (j.Answer ?? []).filter(a => a.type === 2).map(a => a.data.replace(/\.$/, '').toLowerCase())
  } catch { /* DNS público fora do ar: não bloqueia */ }
  const iguais = esperados.length > 0 && atuais.length > 0 && esperados.every(n => atuais.includes(n))
  // Zona ativa = a Cloudflare já confirmou. Sem dado do DNS público, não bloqueia.
  return { ok: status === 'active' || iguais || atuais.length === 0, status, esperados, atuais }
}

export async function ensureKvNamespace(token: string, accountId: string, title: string): Promise<string> {
  const list = await cfFetch<{ id: string; title: string }[]>(`/accounts/${accountId}/storage/kv/namespaces`, token)
  const existing = list.result?.find(ns => ns.title === title)
  if (existing) return existing.id

  const created = await cfFetch<{ id: string }>(`/accounts/${accountId}/storage/kv/namespaces`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!created.success || !created.result) {
    throw new Error(created.errors?.[0]?.message ?? 'não foi possível criar o KV namespace — confira a permissão Workers KV Storage: Edit no token')
  }
  return created.result.id
}

export type WorkerModule = { filename: string; content: string }
export type WorkerBinding =
  | { type: 'plain_text'; name: string; text: string }
  | { type: 'secret_text'; name: string; text: string }
  | { type: 'kv_namespace'; name: string; namespace_id: string }

export async function deployWorkerScript(
  token: string,
  accountId: string,
  scriptName: string,
  modules: WorkerModule[],
  bindings: WorkerBinding[],
): Promise<void> {
  const metadata = {
    main_module: modules[0].filename,
    bindings,
    compatibility_date: '2026-01-01',
  }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  for (const mod of modules) {
    form.append(mod.filename, new Blob([mod.content], { type: 'application/javascript+module' }), mod.filename)
  }

  const res = await fetch(`${CF_API}/accounts/${accountId}/workers/scripts/${scriptName}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const parsed = await res.json() as CfResult<unknown>
  if (!parsed.success) {
    throw new Error(parsed.errors?.[0]?.message ?? 'não foi possível publicar o Worker — confira a permissão Workers Scripts: Edit no token')
  }
}

export async function ensureCustomDomain(
  token: string,
  accountId: string,
  zoneId: string,
  hostname: string,
  scriptName: string,
): Promise<void> {
  const result = await cfFetch(`/accounts/${accountId}/workers/domains`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostname, zone_id: zoneId, service: scriptName, environment: 'production' }),
  })
  if (!result.success) {
    throw new Error(result.errors?.[0]?.message ?? 'não foi possível criar o domínio customizado do Worker — confira a permissão Zone DNS: Edit no token')
  }
}

// Firewall: bloqueia a rede da Meta (AS32934) SÓ no endereço do rastreador. O revisor de
// anúncio da Meta abre a página quase a cada minuto disfarçado de celular; sem isto ele
// chega no Worker e conta no limite de 100 mil acessos/dia do plano grátis. A página do
// anúncio não é afetada (outro endereço). Precisa da permissão "WAF da zona: Editar" no
// token; sem ela devolve ok:false e a publicação segue normal (12/11/2026).
const META_REDES = ['2a03:2880::/32', '2620:0:1c00::/40', '31.13.24.0/21', '31.13.64.0/18', '45.64.40.0/22', '66.220.144.0/20',
  '69.63.176.0/20', '69.171.224.0/19', '74.119.76.0/22', '102.132.96.0/20', '103.4.96.0/22', '129.134.0.0/16',
  '147.75.208.0/20', '157.240.0.0/16', '163.70.128.0/17', '173.252.64.0/18', '179.60.192.0/22', '185.60.216.0/22',
  '185.89.216.0/22', '204.15.20.0/22']
const REGRA_META_REF = 'bloqueia_meta_no_rastreador'

export async function ensureMetaBlockRule(token: string, zoneId: string, hostname: string): Promise<{ ok: boolean; error?: string }> {
  const rule = {
    ref: REGRA_META_REF,
    description: 'Rastreador: bloqueia o robô revisor de anúncio da Meta (não conta no limite do Worker)',
    action: 'block',
    enabled: true,
    expression: `(http.host eq "${hostname}" and ip.src in {${META_REDES.join(' ')}})`,
  }
  const json = { 'Content-Type': 'application/json' }
  const ep = await cfFetch<{ id: string; rules?: { id: string; ref?: string }[] }>(`/zones/${zoneId}/rulesets/phases/http_request_firewall_custom/entrypoint`, token)
  let r: CfResult<unknown>
  if (!ep.success) {
    // 10003 = o domínio ainda não tem nenhuma regra: cria o conjunto já com esta
    if (!ep.errors?.some(e => e.code === 10003)) return { ok: false, error: ep.errors?.[0]?.message ?? 'sem permissão de WAF no token' }
    r = await cfFetch(`/zones/${zoneId}/rulesets/phases/http_request_firewall_custom/entrypoint`, token, { method: 'PUT', headers: json, body: JSON.stringify({ rules: [rule] }) })
  } else {
    const atual = (ep.result.rules ?? []).find(x => x.ref === REGRA_META_REF)
    r = atual
      ? await cfFetch(`/zones/${zoneId}/rulesets/${ep.result.id}/rules/${atual.id}`, token, { method: 'PATCH', headers: json, body: JSON.stringify(rule) })
      : await cfFetch(`/zones/${zoneId}/rulesets/${ep.result.id}/rules`, token, { method: 'POST', headers: json, body: JSON.stringify(rule) })
  }
  return r.success ? { ok: true } : { ok: false, error: r.errors?.[0]?.message ?? 'não foi possível criar a regra de firewall' }
}
