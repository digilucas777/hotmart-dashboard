# Rastreamento — Worker Cloudflare + Deploy Automático (design)

## Contexto

A Etapa 1 (já implementada e publicada) criou o CRUD de "instalações" de rastreamento
no dashboard (`/rastreamento`): tabelas `track_installations/track_pixels/
track_domains/track_triggers/track_events`, com tokens (Cloudflare API token, CAPI
token) criptografados no banco (`lib/crypto.ts`).

O spec original previa dividir o restante do trabalho em Etapa 2 (Worker + deploy
manual) e Etapa 3 (deploy automático via API da Cloudflare). Depois de revisar a
ferramenta de referência (Track1Click) ao vivo no navegador, o usuário pediu pra
seguir o mesmo padrão dela: colar o token da Cloudflare e clicar "Fazer deploy" já
publica tudo sozinho, sem passo manual de copiar/colar código. Este design **junta
as antigas Etapas 2 e 3** num único trabalho: escrever o Worker (genérico,
reutilizável) e o mecanismo de deploy automático via API da Cloudflare.

Requisitos confirmados pelo usuário nesta conversa:
- Suportar os 3 eventos centrais da operação dele: `PageView` (automático),
  `InitiateCheckout` (via gatilho de clique em link — já suportado pelo schema da
  Etapa 1, `track_triggers.tipo = 'click_link'`), e `Purchase` (via webhook Hotmart)
- Maximizar a qualidade de correspondência de evento (EMQ) da Meta: enviar o máximo
  de parâmetros possível em cada evento (fbp, fbc, IP, user agent, e no Purchase
  também nome/e-mail/telefone/CPF do comprador, sempre hasheados em SHA-256)
- Usuário é leigo em tecnologia — zero passos manuais de código; só usar a interface

## Arquitetura

```
Botão "Fazer deploy" (app/rastreamento/_components/InstallationModal.tsx, já existe)
        │
        ▼
POST /api/track/installations/deploy   { id: installationId }
        │  1. decryptSecret(cloudflare_api_token_encrypted)
        │  2. valida token (GET /accounts, checa permissões necessárias)
        │  3. garante KV namespace da instalação (cria se não existir)
        │  4. publica o Worker genérico (mesmo arquivo track-worker/src/index.js
        │     pra todas as instalações) com bindings/vars específicos dela
        │  5. cria/atualiza a rota de domínio customizado (worker_subdomain)
        ▼
API REST da Cloudflare (graph: accounts/{id}/workers/scripts/{name}, .../kv/
namespaces, .../workers/domains)
        ▼
installation.status = 'deployed' (coluna já existe desde a migration 054)
```

**Multi-tenant:** cada instalação tem seu próprio token Cloudflare (pode ser de
contas diferentes no futuro) — o deploy sempre usa o token daquela instalação
específica, nunca um token global do sistema.

**Um script, várias instalações:** o código do Worker é sempre o mesmo arquivo;
o que muda por instalação são as variáveis de ambiente enviadas junto no deploy
(pixels, tokens da CAPI, domínios permitidos, secret do webhook, TTL de sessão,
diagnóstico). Reimplantar (clicar "Fazer deploy" de novo após editar a instalação)
atualiza o mesmo Worker, não cria outro.

## Estrutura de arquivos

### `track-worker/src/index.js` (novo — código do Worker, fora do Next.js)
Um único arquivo Cloudflare Worker (module syntax, `export default { fetch(...) }`)
com roteamento simples por `pathname`:

- **`GET /t.js`** — gera o snippet JS na hora, a partir das variáveis de ambiente
  (pixels, domínios, gatilhos). Injeta:
  - Disparo automático de `PageView` no carregamento da página, gerando (ou
    reaproveitando de um cookie) o `session_id` daquela visita
  - Se enriquecimento de sessão estiver ligado: reescreve, na hora do clique, os
    links da página cujo destino bate com um domínio de checkout cadastrado,
    anexando `?hottrack_sid={session_id}` — é assim que o `/webhook/hotmart`
    depois consegue cruzar a compra com a sessão salva no KV
  - Listener de clique em link pra cada gatilho `click_link` configurado (ex:
    dispara `InitiateCheckout` quando o link clicado contém `hotmart.com`)
  - Os demais tipos de gatilho da Etapa 1 (scroll, form_submit, click_element,
    url_visited, time_on_page, video_progress), cada um só incluído no script se
    a instalação tiver esse gatilho configurado (mantém o arquivo pequeno)
  - Função global `HotTrack.track(eventName, params)` pra disparo manual
- **`POST /collect`** — recebe os eventos do `t.js`. Valida `Origin`/`Referer`
  contra a allowlist de domínios (`tipo = 'lp'`). Se enriquecimento de sessão
  estiver ligado, salva no KV: `sid:{session_id}` → `{ fbp, fbc, ip, geo, user_agent,
  criado_em }` (TTL = `session_ttl_days`). Envia o evento pra Meta via CAPI
  (fetch em `graph.facebook.com`), com `event_id` compartilhado com o pixel do
  navegador pra deduplicar.
- **`GET|POST /webhook/hotmart`** — recebe o postback. Valida `?secret=` contra
  `webhook_secret`. Extrai nome/e-mail/telefone/CPF do payload da Hotmart, hasheia
  em SHA-256. Se a URL de checkout carregava um `session_id`, busca no KV os dados
  de sessão salvos e mescla. Monta e envia `Purchase` pra Meta via CAPI.
- **`GET /health`** — devolve versão do script e contagem de pixels configurados
  (só texto simples, pra diagnóstico manual)

### `track-worker/README.md` (novo)
Notas de desenvolvimento do Worker (não é voltado ao usuário final — ele nunca
edita isso diretamente, só existe como referência técnica no repo).

### `lib/track/cloudflareDeploy.ts` (novo)
Funções que encapsulam as chamadas à API REST da Cloudflare:
- `validateCloudflareToken(token): Promise<{ ok: boolean; accountId?: string; missingPermissions?: string[] }>`
- `ensureKvNamespace(token, accountId, title): Promise<string>` (retorna namespace id)
- `deployWorkerScript(token, accountId, scriptName, code, bindings): Promise<void>`
- `ensureCustomDomainRoute(token, zoneId, workerSubdomain, scriptName): Promise<void>`

### `app/api/track/installations/deploy/route.ts` (novo)
Rota POST que orquestra as funções acima na ordem certa, atualiza
`track_installations.status` e `cloudflare_account_id`, e devolve mensagens de
erro claras (ex: "token sem permissão de Workers KV Storage: Edit") pra exibir
na interface.

### `app/rastreamento/_components/InstallationModal.tsx` (edição)
O botão "Fazer deploy" (hoje só um placeholder textual) passa a chamar essa rota
de verdade, com spinner de carregamento e exibição de erro/sucesso.

## Fluxo dos 3 eventos principais (confirmação dos requisitos do usuário)

1. **PageView** — automático, disparado pelo `/t.js` assim que a página carrega.
   Sempre inclui fbp/fbc/IP/user-agent (o máximo disponível nesse momento).
2. **InitiateCheckout** — o usuário configura, na Seção 3 da instalação, um
   gatilho `click_link` com filtro contendo o domínio/link do botão de comprar
   (ex: `hotmart.com`) e evento Meta = `InitiateCheckout`. Isso já é suportado
   pelo schema e pela interface da Etapa 1; o trabalho aqui é o `/t.js` do Worker
   interpretar esse gatilho e disparar o evento no clique.
3. **Purchase** — via webhook da Hotmart (novo, adicional ao webhook já existente
   do dashboard — não mexe nele). Inclui os dados hasheados do comprador +
   fbp/fbc/geo/IP cruzados da sessão salva no KV, maximizando a qualidade de
   correspondência (EMQ) no Gerenciador de Eventos da Meta.

## Detalhe técnico a confirmar durante a implementação
A Hotmart precisa devolver, no payload do webhook de compra, o parâmetro
`hottrack_sid` que foi anexado ao link de checkout — o projeto já tem uma rota
(`app/api/hotmart/sync-origem/route.ts`) que lida com parâmetros de origem
repassados pela Hotmart; o plano de implementação vai verificar o formato exato
usado por ela (provavelmente o campo `src`/`sck`) antes de decidir o nome do
parâmetro que o `/t.js` deve anexar.

## Segurança
- Tokens (Cloudflare, CAPI) só saem descriptografados em memória, no momento do
  deploy — nunca logados, nunca devolvidos ao navegador
- Dados pessoais do comprador sempre hasheados em SHA-256 antes de qualquer envio
  à Meta (conforme especificação da CAPI)
- `/collect` rejeita eventos de origem fora da allowlist de domínios
- `/webhook/hotmart` rejeita requisições sem o `secret` correto

## Fora de escopo (confirmado nesta conversa e em etapas anteriores)
- GA4, Google Ads, WhatsApp CTWA, outras plataformas de checkout — só Meta + Hotmart
- Dashboard de eventos em tempo real / diagnóstico visual — fica pra depois (era a
  antiga "Etapa 4"), não faz parte deste trabalho

## Verificação
1. Criar/editar uma instalação real na aba Rastreamento com o pixel, token da CAPI
   e domínio do produto de teste (massagem tântrica ES)
2. Clicar "Fazer deploy" e confirmar que o Worker aparece publicado na conta
   Cloudflare do usuário (visível no painel deles)
3. Colar o `/t.js` gerado numa página de teste, confirmar `PageView` no Gerenciador
   de Eventos da Meta (com código de teste preenchido)
4. Clicar no botão de comprar (link pro checkout Hotmart) e confirmar
   `InitiateCheckout`
5. Fazer uma compra de teste e confirmar `Purchase` com dados do comprador e
   fbp/fbc cruzados
