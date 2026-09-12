import type { SupabaseClient } from '@supabase/supabase-js'

// Acesso ao módulo de Rastreamento não é mais só "role === admin" (isso dava
// acesso a TUDO no painel — vendas de todo mundo, sites, perfis de outros
// usuários). Agora também aceita a permissão específica
// "pode_gerenciar_rastreamento", que só libera esta aba, nada mais — pensada
// pra liberar rastreamento pra alguém (ex: outro media buyer cuidando do
// próprio produto) sem torná-lo admin do sistema inteiro.
export async function canManageTracking(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_profiles')
    .select('role, pode_gerenciar_rastreamento')
    .eq('id', userId)
    .maybeSingle()
  const profile = data as { role?: string; pode_gerenciar_rastreamento?: boolean } | null
  return profile?.role === 'admin' || profile?.pode_gerenciar_rastreamento === true
}
