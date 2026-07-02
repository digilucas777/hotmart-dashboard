import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const ID = process.argv[2] ?? 'HP1660539472'
sb.from('vendas').select('hotmart_id,valor,valor_bruto,taxa_hotmart,comissao_produtor,comissao_afiliado,moeda,hotmart_payload').eq('hotmart_id', ID).single().then(({ data: d, error }) => {
  if (error || !d) return console.error(error ?? 'not found')
  const p = d.hotmart_payload as any
  console.log('hotmart_id:', d.hotmart_id)
  console.log('valor:', d.valor, '| moeda:', d.moeda)
  console.log('valor_bruto:', d.valor_bruto, '| taxa_hotmart:', d.taxa_hotmart)
  console.log('comissao_produtor:', d.comissao_produtor, '| comissao_afiliado:', d.comissao_afiliado)
  console.log('priceCurrency:', p?.data?.purchase?.price?.currency_value)
  console.log('price.value:', p?.data?.purchase?.price?.value)
  console.log('commissions:', JSON.stringify(p?.data?.commissions ?? []))
  console.log('produto:', p?.data?.product?.name)
})
