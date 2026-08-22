import { ComboClient } from './ComboClient'

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ComboClient key={id} comboId={id} />
}
