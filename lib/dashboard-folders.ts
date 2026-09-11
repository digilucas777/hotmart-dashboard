import { supabase } from './supabase'

export type DashboardFolder = { id: string; nome: string; ordem: number }

export async function fetchFolders(): Promise<DashboardFolder[]> {
  const { data, error } = await supabase
    .from('dashboard_folders')
    .select('id, nome, ordem')
    .order('ordem', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as DashboardFolder[]
}

export async function fetchFolderProjetoIds(): Promise<Record<string, string[]>> {
  const { data, error } = await supabase
    .from('dashboard_folder_projetos')
    .select('folder_id, projeto_id')
  if (error) throw error
  const map: Record<string, string[]> = {}
  for (const row of (data ?? []) as { folder_id: string; projeto_id: string }[]) {
    map[row.folder_id] = map[row.folder_id] ?? []
    map[row.folder_id].push(row.projeto_id)
  }
  return map
}

export async function createFolder(nome: string, ordem: number): Promise<DashboardFolder> {
  const { data, error } = await supabase
    .from('dashboard_folders')
    .insert({ nome, ordem })
    .select('id, nome, ordem')
    .single()
  if (error) throw error
  return data as DashboardFolder
}

export async function renameFolder(id: string, nome: string): Promise<void> {
  const { error } = await supabase.from('dashboard_folders').update({ nome }).eq('id', id)
  if (error) throw error
}

export async function deleteFolder(id: string): Promise<void> {
  const { error } = await supabase.from('dashboard_folders').delete().eq('id', id)
  if (error) throw error
}

export async function setFolderProjetos(folderId: string, projetoIds: string[]): Promise<void> {
  const { error: delError } = await supabase
    .from('dashboard_folder_projetos')
    .delete()
    .eq('folder_id', folderId)
  if (delError) throw delError
  if (projetoIds.length === 0) return
  const { error: insError } = await supabase
    .from('dashboard_folder_projetos')
    .insert(projetoIds.map(projeto_id => ({ folder_id: folderId, projeto_id })))
  if (insError) throw insError
}

// Marcar/desmarcar um checkbox de cada vez usa essas duas — cada clique é uma operação
// de 1 linha, atômica, sem depender de reler a lista inteira da pasta primeiro. Isso evita
// perder marcações quando o usuário clica em vários checkboxes rápido (o setFolderProjetos
// acima reescreve a lista inteira a cada chamada, então dois cliques quase simultâneos podem
// fazer o segundo sobrescrever o resultado do primeiro).
export async function addFolderProjeto(folderId: string, projetoId: string): Promise<void> {
  const { error } = await supabase
    .from('dashboard_folder_projetos')
    .upsert({ folder_id: folderId, projeto_id: projetoId })
  if (error) throw error
}

export async function removeFolderProjeto(folderId: string, projetoId: string): Promise<void> {
  const { error } = await supabase
    .from('dashboard_folder_projetos')
    .delete()
    .eq('folder_id', folderId)
    .eq('projeto_id', projetoId)
  if (error) throw error
}
