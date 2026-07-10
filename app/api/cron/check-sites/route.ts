import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAndUpdatePages, type PageRow } from '@/lib/siteCheck'

function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Roda de hora em hora via GitHub Actions (.github/workflows/check-sites.yml) —
// não depende do Cron da Vercel porque o plano gratuito só roda cron 1x/dia.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 })

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'service key not configured' }, { status: 500 })

  const { data: pages, error } = await admin
    .from('monitored_pages')
    .select('id, url, ultimo_status, monitored_sites(user_id, nome)')
    .eq('ativo', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!pages || pages.length === 0) return NextResponse.json({ ok: true, checadas: 0 })

  const resumo = await checkAndUpdatePages(admin, pages as unknown as PageRow[])

  return NextResponse.json({ ok: true, checadas: resumo.length, resultados: resumo })
}
