import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decryptSecret } from '@/lib/crypto'
import { notifyCloudflareUsageWarning } from '@/lib/push'

function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Plano gratuito da Cloudflare Workers: 100.000 requisições/dia por conta.
// Avisa a partir de 80% pra dar tempo do usuário decidir (upgrade ou reduzir uso)
// antes de bater no limite e começar a ter requisições rejeitadas.
const DAILY_REQUEST_LIMIT = 100_000
const WARNING_THRESHOLD = 0.8

function scriptNameFor(installationId: string): string {
  return `track-${installationId.replace(/-/g, '').slice(0, 16)}`
}

async function fetchTodayRequests(token: string, accountId: string, scriptName: string): Promise<number | null> {
  const now = new Date()
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()

  const query = `
    query GetWorkerUsage($accountTag: String!, $scriptName: String!, $since: Time!, $until: Time!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          workersInvocationsAdaptive(
            limit: 1
            filter: { scriptName: $scriptName, datetime_geq: $since, datetime_leq: $until }
          ) {
            sum { requests }
          }
        }
      }
    }
  `

  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      variables: { accountTag: accountId, scriptName, since: startOfDay, until: now.toISOString() },
    }),
  })
  if (!res.ok) return null
  const json = await res.json()
  const requests = json?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive?.[0]?.sum?.requests
  return typeof requests === 'number' ? requests : null
}

type InstallationRow = {
  id: string
  nome: string
  user_id: string
  cloudflare_api_token_encrypted: string | null
  cloudflare_account_id: string | null
}

// Plano gratuito do Workers KV: 4 sub-limites diários SEPARADOS (bem mais
// apertados que o de requisições do Worker), e por CONTA CLOUDFLARE INTEIRA
// — não por instalação/namespace. Uma falha de leitura/escrita no KV nunca
// impede o envio do evento à Meta (ver track-worker/src/index.js), mas
// mesmo assim vale avisar antes de começar a tomar 429 do KV.
const KV_DAILY_LIMITS: Record<string, number> = { read: 100_000, write: 1_000, delete: 1_000, list: 1_000 }
const KV_METRIC_LABELS: Record<string, string> = {
  read: 'leituras no KV',
  write: 'escritas no KV',
  delete: 'exclusões no KV',
  list: 'listagens no KV',
}

async function fetchTodayKvOperations(token: string, accountId: string): Promise<Record<string, number> | null> {
  const today = new Date().toISOString().slice(0, 10)

  const query = `
    query GetKvUsage($accountTag: String!, $date: Date!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          kvOperationsAdaptiveGroups(
            limit: 10
            filter: { date_geq: $date, date_leq: $date }
          ) {
            dimensions { actionType }
            sum { requests }
          }
        }
      }
    }
  `

  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { accountTag: accountId, date: today } }),
  })
  if (!res.ok) return null
  const json = await res.json()
  const groups = json?.data?.viewer?.accounts?.[0]?.kvOperationsAdaptiveGroups
  if (!Array.isArray(groups)) return null

  const result: Record<string, number> = {}
  for (const g of groups) {
    const actionType = String(g?.dimensions?.actionType ?? '').toLowerCase()
    const requests = Number(g?.sum?.requests ?? 0)
    if (actionType) result[actionType] = (result[actionType] ?? 0) + requests
  }
  return result
}

// Roda periodicamente via GitHub Actions (.github/workflows/check-track-usage.yml)
// — mesmo padrão de app/api/cron/check-sites, que também não depende do Cron
// da Vercel (plano gratuito só roda 1x/dia, cedo demais pra avisar a tempo).
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 })

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'service key not configured' }, { status: 500 })

  const { data: installations, error } = await admin
    .from('track_installations')
    .select('id, nome, user_id, cloudflare_api_token_encrypted, cloudflare_account_id')
    .eq('status', 'deployed')
    .not('cloudflare_api_token_encrypted', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!installations || installations.length === 0) return NextResponse.json({ ok: true, checadas: 0 })

  const resultados = []
  for (const inst of installations as InstallationRow[]) {
    try {
      if (!inst.cloudflare_account_id) {
        resultados.push({ id: inst.id, status: 'sem_account_id' })
        continue
      }
      const token = decryptSecret(inst.cloudflare_api_token_encrypted as string)
      const scriptName = scriptNameFor(inst.id)
      const requests = await fetchTodayRequests(token, inst.cloudflare_account_id, scriptName)

      if (requests === null) {
        resultados.push({ id: inst.id, status: 'consulta_falhou' })
        continue
      }

      if (requests / DAILY_REQUEST_LIMIT >= WARNING_THRESHOLD) {
        await notifyCloudflareUsageWarning({
          userId: inst.user_id,
          installationNome: inst.nome,
          metricLabel: 'requisições',
          metricKey: 'requests',
          count: requests,
          limit: DAILY_REQUEST_LIMIT,
        })
        resultados.push({ id: inst.id, status: 'aviso_enviado', requests })
      } else {
        resultados.push({ id: inst.id, status: 'ok', requests })
      }
    } catch (err) {
      resultados.push({ id: inst.id, status: 'erro', message: err instanceof Error ? err.message : String(err) })
    }
  }

  // O limite do Workers KV é por conta Cloudflare inteira, não por instalação
  // (diferente do check de requisições acima) — agrupa por
  // cloudflare_account_id pra consultar 1x por conta em vez de 1x por
  // instalação, senão contas com várias instalações levariam consulta e
  // aviso duplicados.
  const contasPorId = new Map<string, InstallationRow[]>()
  for (const inst of installations as InstallationRow[]) {
    if (!inst.cloudflare_account_id || !inst.cloudflare_api_token_encrypted) continue
    const lista = contasPorId.get(inst.cloudflare_account_id) ?? []
    lista.push(inst)
    contasPorId.set(inst.cloudflare_account_id, lista)
  }

  const resultadosKv = []
  for (const [accountId, insts] of contasPorId) {
    try {
      const token = decryptSecret(insts[0]!.cloudflare_api_token_encrypted as string)
      const ops = await fetchTodayKvOperations(token, accountId)
      if (!ops) {
        resultadosKv.push({ accountId, status: 'consulta_falhou' })
        continue
      }

      for (const [actionType, limit] of Object.entries(KV_DAILY_LIMITS)) {
        const count = ops[actionType] ?? 0
        if (count / limit < WARNING_THRESHOLD) {
          resultadosKv.push({ accountId, actionType, status: 'ok', count })
          continue
        }

        const porUsuario = new Map<string, string[]>()
        for (const inst of insts) {
          const nomes = porUsuario.get(inst.user_id) ?? []
          nomes.push(inst.nome)
          porUsuario.set(inst.user_id, nomes)
        }
        for (const [userId, nomes] of porUsuario) {
          await notifyCloudflareUsageWarning({
            userId,
            installationNome: nomes.join(', '),
            metricLabel: KV_METRIC_LABELS[actionType] ?? `operações "${actionType}" no KV`,
            metricKey: `kv-${actionType}`,
            count,
            limit,
          })
        }
        resultadosKv.push({ accountId, actionType, status: 'aviso_enviado', count })
      }
    } catch (err) {
      resultadosKv.push({ accountId, status: 'erro', message: err instanceof Error ? err.message : String(err) })
    }
  }

  return NextResponse.json({ ok: true, checadas: resultados.length, resultados, resultadosKv })
}
