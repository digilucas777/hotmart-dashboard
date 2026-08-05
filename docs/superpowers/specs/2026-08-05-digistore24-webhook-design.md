# Webhook da Digistore24 → tabela `vendas`

## Contexto

O usuário está lançando 3 produtos físicos na Digistore24 (M1/M2/M3 — 1/3/6
frascos, com possíveis duplicados futuros pra outros gestores venderem,
mesmo padrão que já existe na Hotmart) e quer um dashboard novo mostrando o
faturamento deles, com os gastos continuando a ser preenchidos manualmente
(`custos_manuais`, recurso já existente). Não é uma integração de
rastreamento/Meta Ads — é o mesmo papel que o webhook principal da Hotmart
(`app/api/webhook/hotmart/route.ts`) já cumpre pro resto do sistema:
transformar uma notificação de venda da plataforma numa linha da tabela
`vendas`, que todo dashboard/relatório já sabe ler.

Confirmado com o usuário nesta conversa:
- Os produtos (e duplicados futuros) entram numa **única conexão de
  webhook** na Digistore24, com "Para produtos" marcado como **Tudo** — a
  rota cria/atualiza o produto automaticamente a partir de
  `product_id`/`product_name` de cada venda, igual a Hotmart já faz, sem
  precisar saber de antemão quais produtos existem.
- Sem venda de teste no momento da implementação — o mapeamento do campo
  `event` (abaixo) será confirmado com a primeira venda real.

## Formato da Digistore24 (confirmado pela tela de configuração de IPN que o usuário colou)

- Entrega via **GET**: os dados chegam como parâmetros na própria URL, não
  como corpo JSON (diferença central em relação ao webhook da Hotmart).
- Sem assinatura criptográfica nessa tela — autenticação via `?secret=`
  colado na própria "URL de webhook".
- Parâmetros usados (nomes padrão da Digistore24): `email`, `first_name`,
  `last_name`, `country_name`, `order_id`, `transaction_id`, `product_id`,
  `product_name`, `amount_brutto`, `amount_netto`, `amount_vendor`,
  `amount_affiliate`, `currency`, `event`, `utm_source`.

## Mapeamento de campos → `vendas`

| Campo Digistore24 | Coluna `vendas` | Observação |
|---|---|---|
| `transaction_id` (fallback `order_id`) | `digistore_id` (nova coluna) | chave de conflito do upsert — não reaproveita `hotmart_id`, pra não misturar namespaces de ID |
| `product_id` | `hotmart_produto_id` | reaproveita a coluna existente de propósito — é ela que todo o resto do sistema (filtro por projeto, `resolveProjetos`) já usa como "id externo do produto", independente da plataforma |
| `product_name` | `produto` | |
| `first_name` + `last_name` | `comprador_nome` | concatenado |
| `email` | `comprador_email` | |
| `amount_vendor` | `valor`, `valor_operacional_final` | é literalmente "o que o vendedor recebe" — já líquido da taxa da Digistore24 |
| `amount_brutto` | `valor_bruto` | |
| `amount_brutto - amount_netto` | `taxa_hotmart` (coluna reaproveitada) | taxa da plataforma |
| `amount_affiliate` | `comissao_afiliado` | |
| `currency` | `moeda` | |
| `country_name` | `pais` | |
| `utm_source` | `origem` | |
| `event` (mapeado, tabela abaixo) | `status` | |
| todos os parâmetros recebidos | `hotmart_payload` (coluna reaproveitada) | mesmo propósito de debug que já tem pra Hotmart |
| `new Date().toISOString()` | `data_venda` | Digistore24 não manda data de pedido nesse conjunto de parâmetros |

Campos sem equivalente (`oferta_*`, `plano_*`, `forma_pagamento`,
`afiliado_nome`) ficam `null` — o resto do sistema já trata como opcionais.

### Mapeamento de `event` → `status` (a confirmar com venda real)

Replica o padrão defensivo de `mapStatus` do webhook da Hotmart: qualquer
valor não reconhecido cai em `'pending'` em vez de quebrar.

| Evento (rótulo da tela) | valor esperado (a confirmar) | `status` |
|---|---|---|
| Pagamento | `payment` | `approved` |
| Devolução | `refund` | `refunded` |
| Estorno de débito | `chargeback` | `chargeback` |
| Pagamento recusado | `payment_denial` | `pending` |
| Assinatura/parcelamento cancelado | `rebill_cancelled` | `cancelled` |
| Assinatura/parcelamento retomado | `rebill_resumed` | `approved` |
| Pagamento de assinatura não pago | `rebill_missed` (nome a confirmar) | `pending` |
| Período pago terminado | `rebill_stopped` (nome a confirmar) | `cancelled` |
| *(qualquer outro valor)* | — | `pending` (fallback seguro) |

**Ação pendente pós-venda real**: quando a 1ª venda chegar, olhar o valor de
`event` salvo em `hotmart_payload` e corrigir o `EVENT_STATUS_MAP` da rota
se os nomes reais vierem diferentes do esperado.

## Implementação

### Migração

```sql
alter table vendas add column if not exists digistore_id text;
create unique index if not exists vendas_digistore_id_key
  on vendas (digistore_id);
```

Sem `where digistore_id is not null` — diferente do índice parcial que já
causou um bug real no módulo de Rastreamento nesta mesma sessão. Aqui é uma
`UNIQUE` normal numa coluna nullable: Postgres nunca considera dois `NULL`
iguais entre si, então as vendas da Hotmart (que nunca preenchem
`digistore_id`) não conflitam entre si — `.upsert(row, { onConflict:
'digistore_id' })` funciona direto, sem o problema do índice parcial.

### Rota `app/api/webhook/digistore24/route.ts`

- `export async function GET(req: NextRequest)` — lê `req.nextUrl.searchParams`.
- Valida `searchParams.get('secret') === process.env.DIGISTORE24_WEBHOOK_SECRET`; 401 se não bater.
- `upsert` em `produtos` com `{ hotmart_id: product_id, nome: product_name }`
  (`onConflict: 'hotmart_id'`) — mesmo padrão do webhook da Hotmart, cria o
  produto na 1ª venda dele.
- Monta o objeto `venda` pela tabela de mapeamento acima e faz
  `supabase.from('vendas').upsert(venda, { onConflict: 'digistore_id' })`.
- Reaproveita `resolveNotifCategory`/`resolveProjetos`/`notifySale`
  (`lib/push.ts`, já usado pela Hotmart) pra notificação push de venda nova.
  `resolveNotifCategory` espera o literal `'PURCHASE_APPROVED'` pra
  categorizar como "venda_realizada" (é assim que ela distingue 1ª
  aprovação de um evento de acompanhamento tardio específico da Hotmart) —
  como a Digistore24 não tem esse 2º evento no nosso mapeamento, todo
  status `approved` aqui já é uma aprovação nova de verdade, então a rota
  passa esse mesmo literal nesse caso pra cair na categoria certa sem
  duplicar a lógica de categorização.
- Sempre responde 200 mesmo em erro de parsing pontual (mesmo espírito
  defensivo do webhook da Hotmart), mas retorna erro real se o `secret` não
  bater ou se o upsert em `vendas` falhar de verdade.

### Configuração (usuário faz depois do deploy)

1. Variável de ambiente na Vercel (projeto `hotmart-dashboard`, Production):
   `DIGISTORE24_WEBHOOK_SECRET` = valor gerado nesta sessão (compartilhado
   com o usuário no chat, não versionado aqui).
2. URL de webhook na Digistore24:
   `https://www.dashspeed.site/api/webhook/digistore24?secret=<o mesmo valor>`
3. "Para produtos": marcar **Tudo**. "Envie notificações em": **Pedidos do
   cliente**. "Por evento de pedido": marcar todos.

## Fora de escopo

Sem fbp/fbc, sem envio à Meta CAPI, sem cruzamento de sessão de navegador —
essa integração é só faturamento entrando no dashboard, por decisão
explícita do usuário.

## Verificação

1. `npx tsc --noEmit && npm run build` sem erros.
2. Migração aplicada via Supabase MCP.
3. Chamada de teste simulada (curl com um `transaction_id` marcado como
   teste) confirmando que a linha aparece em `vendas` com os campos certos;
   linha de teste removida depois.
4. Usuário precisa confirmar que salvou a env var na Vercel antes do
   próximo deploy pegar essa rota (ela lê `process.env.DIGISTORE24_WEBHOOK_SECRET`
   em runtime).
5. Quando a 1ª venda real chegar: conferir o valor de `event` salvo em
   `hotmart_payload` e corrigir o `EVENT_STATUS_MAP` se necessário.
