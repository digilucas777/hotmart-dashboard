# track-worker

Worker Cloudflare do módulo de Rastreamento do hotmart-dashboard. Não é um
projeto separado com deploy próprio — os arquivos de `src/` são lidos direto
pela rota `app/api/track/installations/deploy/route.ts` e enviados como módulos
pra API da Cloudflare a cada clique em "Fazer deploy" na interface.

Rotas: `GET /t.js`, `POST /collect`, `POST /webhook/hotmart`, `GET /health`.

Rodar os testes: `npm test` (ou `node --test src/`)
