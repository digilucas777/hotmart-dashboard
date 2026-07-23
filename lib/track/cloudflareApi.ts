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
