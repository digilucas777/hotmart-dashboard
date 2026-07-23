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
  - Listener pra cada gatilho configurado na instalação (scroll, form_submit,
    click_link, click_element, url_visited, time_on_page, video_progress), cada
    um só incluído no script se a instalação tiver esse gatilho configurado
    (mantém o arquivo pequeno). O gatilho `form_submit`, quando detecta um campo
    de e-mail, inclui esse e-mail (hasheado) no evento — é essa a ponte pro
    enriquecimento por e-mail (ver seção abaixo)
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

## Fluxo dos 3 eventos principais (revisado após descobertas desta conversa)

1. **PageView** — automático, disparado pelo `/t.js` assim que a página carrega.
   Sempre inclui fbp/fbc/IP/user-agent (o máximo disponível nesse momento).
2. **InitiateCheckout** — **não é responsabilidade do nosso Worker.** A Hotmart já
   dispara esse evento nativamente (pixel cadastrado no produto, na página de
   checkout dela). O usuário só precisa manter esse evento marcado nas
   configurações de "Pixels de Rastreamento" do produto, na própria Hotmart.
3. **Purchase** — via webhook da Hotmart (novo, adicional ao webhook já existente
   do dashboard — não mexe nele). **O usuário precisa desmarcar o evento Purchase
   nas configurações de "Pixels de Rastreamento" do produto na Hotmart**, deixando
   só a Hotmart cuidar do InitiateCheckout — senão a venda seria contada em
   dobro na Meta (uma vez pelo pixel nativo da Hotmart, outra pela nossa CAPI).
   A interface do dashboard precisa deixar esse aviso claro (ver seção "Avisos na
   interface" abaixo).

### Por que não cruzamos fbp/fbc no Purchase via parâmetro de URL

Investigamos usar o mecanismo padrão da Hotmart (parâmetro `src`/`sck` na URL do
checkout, devolvido no webhook) pra levar um identificador de sessão até o
Purchase. **Descartado**: esse mesmo campo já alimenta a coluna `origem` de
`vendas` (função `extractOrigem` em `app/api/webhook/hotmart/route.ts`), usada
nos relatórios de origem/tráfego já existentes. Usar esse campo pra outra coisa
corromperia esses relatórios.

### Enriquecimento por e-mail (melhor esforço, não garantido)

Alternativa adotada: quando o enriquecimento de sessão está ligado, o `/collect`
grava a sessão no KV sob duas chaves — `sid:{session_id}` (sempre) e, **se um
gatilho `form_submit` capturar um e-mail na página**, também sob
`email:{sha256(email)}`. No webhook de compra, o Worker tenta achar a sessão pelo
e-mail do comprador (`data.buyer.email`, já vem no payload da Hotmart) hasheado
do mesmo jeito; se achar, mescla fbp/fbc/geo no Purchase; se não achar, envia o
Purchase só com os dados hasheados do comprador (sem o bônus de fbp/fbc).

**Confirmado nesta conversa:** o funil do usuário não tem captura de e-mail antes
do checkout (só a própria Hotmart pergunta o e-mail, no checkout dela). Isso
significa que, **para as instalações atuais dele, o cruzamento por e-mail nunca
vai encontrar nada** — o Purchase sempre vai sair só com os dados do comprador,
sem fbp/fbc. Implementamos o mecanismo mesmo assim (custo baixo, é só mais uma
chave de KV) porque ele passa a funcionar automaticamente no dia em que ele
configurar algum formulário de captura de e-mail antes do checkout, em qualquer
instalação futura.

## Avisos na interface (novo requisito desta conversa)

Em `app/rastreamento/_components/InstallationModal.tsx`, seção 4 (Webhook de
compra), adicionar um aviso fixo (não é só texto de ajuda, é um alerta visual)
explicando: *"Antes de ativar, vá em Hotmart → seu produto → Pixels de
Rastreamento e desmarque o evento Purchase, deixando só InitiateCheckout marcado
— senão a venda conta em dobro na Meta."*

No toggle "Enriquecer com dados de sessão", adicionar uma nota explicando que só
tem efeito no Purchase se houver um gatilho de formulário (`form_submit`)
capturando e-mail **antes** do checkout — senão o cruzamento nunca vai encontrar
nada (mas não tem problema deixar ligado mesmo assim).

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
4. Confirmar, no produto da Hotmart, que "Pixels de Rastreamento" está com
   InitiateCheckout marcado e Purchase desmarcado
5. Fazer uma compra de teste e confirmar `Purchase` com os dados hasheados do
   comprador chegando (sem fbp/fbc, já que este funil não captura e-mail antes
   do checkout — comportamento esperado)
