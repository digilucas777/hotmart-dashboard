import { DashboardClient } from './DashboardClient'

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // key={id} força o React a remontar o componente do zero a cada troca de projeto
  // (pelo seletor ou por link direto) — sem isso, caches internos (ex: config de
  // produtos em useRef) ficavam presos no projeto anterior até um refresh manual,
  // fazendo o dashboard mostrar métricas zeradas/erradas ao trocar de projeto.
  return <DashboardClient key={id} projectId={id} />
}
