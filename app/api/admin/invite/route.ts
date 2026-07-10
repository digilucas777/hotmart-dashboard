import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '../../meta/_utils'

type InvitePermission = {
  projeto_id: string
  pode_visualizar?: boolean
  pode_editar_layout?: boolean
  pode_adicionar_widgets?: boolean
  pode_configurar_produtos?: boolean
  pode_ver_produtos_ofertas?: boolean
  pode_excluir_dashboard?: boolean
  pode_ver_vendas?: boolean
  pode_adicionar_custo_manual?: boolean
  pode_ver_conexao_whatsapp?: boolean
  is_admin_dashboard?: boolean
  dados_visiveis_a_partir?: string | null
}

function makeAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function GET(_request: Request) {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin = makeAdminClient()
  if (!admin) return NextResponse.json({ error: 'service key not configured' }, { status: 500 })

  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const pending = (data?.users ?? [])
    .filter(u => u.invited_at && !u.email_confirmed_at)
    .map(u => ({
      id: u.id,
      email: u.email ?? '',
      invited_at: u.invited_at ?? '',
    }))

  return NextResponse.json({ pending })
}

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { email, permissoes } = await request.json() as {
    email?: string
    permissoes?: InvitePermission[]
  }
  if (!email?.trim()) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const admin = makeAdminClient()
  if (!admin) return NextResponse.json({ error: 'service key not configured' }, { status: 500 })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://dashspeed.site'
  const { data: inviteData, error } = await admin.auth.admin.inviteUserByEmail(email.trim(), {
    redirectTo: `${siteUrl}/auth/confirm`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (permissoes && permissoes.length > 0 && inviteData?.user?.id) {
    const rows = permissoes.map(p => ({
      user_id: inviteData.user.id,
      projeto_id: p.projeto_id,
      pode_visualizar: p.pode_visualizar ?? true,
      pode_editar_layout: p.pode_editar_layout ?? false,
      pode_adicionar_widgets: p.pode_adicionar_widgets ?? false,
      pode_configurar_produtos: p.pode_configurar_produtos ?? false,
      pode_ver_produtos_ofertas: p.pode_ver_produtos_ofertas ?? false,
      pode_excluir_dashboard: p.pode_excluir_dashboard ?? false,
      pode_ver_vendas: p.pode_ver_vendas ?? false,
      pode_adicionar_custo_manual: p.pode_adicionar_custo_manual ?? false,
      pode_ver_conexao_whatsapp: p.pode_ver_conexao_whatsapp ?? false,
      is_admin_dashboard: p.is_admin_dashboard ?? false,
      dados_visiveis_a_partir: p.dados_visiveis_a_partir ?? null,
    }))
    await admin.from('user_dashboard_permissions').insert(rows)
  }

  return NextResponse.json({ ok: true })
}
