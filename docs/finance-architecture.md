# Arquitetura financeira Hotmart

## Fonte oficial

O webhook Hotmart em `app/api/webhook/hotmart/route.ts` e o banco são a única fonte oficial para valores financeiros de vendas.

O frontend não calcula faturamento, não soma comissões e não interpreta payload financeiro. Widgets, gráficos, tabelas, sidebar, comparativos e relatórios devem ler somente `vendas.valor_operacional_final` para valores operacionais.

## Fluxo

1. A Hotmart envia o evento para o webhook.
2. O webhook extrai preço bruto, moeda e comissões.
3. O webhook soma apenas comissões na mesma moeda da venda.
4. O webhook salva os componentes separados e o valor consolidado no banco.
5. A dashboard apenas lê e exibe `valor_operacional_final`.

## Colunas financeiras

- `valor_bruto`: preço bruto/original da venda na moeda original.
- `taxa_hotmart`: comissão `MARKETPLACE`, tratada como taxa Hotmart.
- `comissao_produtor`: soma de `PRODUCER`, `SELLER`, `VENDOR` ou fontes equivalentes do proprietário.
- `comissao_coprodutor`: soma de `COPRODUCER`, `CO_PRODUCER`, `CO-PRODUCER` ou `COPRODUTOR`.
- `comissao_afiliado`: soma de `AFFILIATE` ou `AFILIADO`.
- `valor_operacional_final`: valor financeiro oficial consumido pelo frontend.

Colunas antigas como `valor`, `valor_recebido` e `comissao_coprodutor` são mantidas por compatibilidade, mas não devem ser usadas como fonte financeira oficial no frontend.

## Regra de cálculo

O cálculo oficial do webhook é:

```text
valor_operacional_final =
  comissao_produtor
  + comissao_coprodutor
  + comissao_afiliado
  - taxa_hotmart
```

Para eventos de abandono, `valor_operacional_final` deve ser `0`.

## Regra de moedas

Nunca misturar moedas.

- Venda em USD soma apenas comissões USD.
- Venda em BRL soma apenas comissões BRL.
- Venda em EUR soma apenas comissões EUR.

Não existe conversão implícita no webhook. Conversões exibidas na UI, quando existirem, são apenas apresentação usando taxa externa e partem de `valor_operacional_final`.

## Regra permanente para frontend

É proibido implementar no frontend:

- `valor_recebido + comissao_coprodutor`
- soma dinâmica de comissões
- interpretação de `hotmart_payload`
- cálculo de faturamento Hotmart

Qualquer ajuste financeiro deve ser feito no webhook/backend e persistido em coluna oficial antes de chegar à UI.
