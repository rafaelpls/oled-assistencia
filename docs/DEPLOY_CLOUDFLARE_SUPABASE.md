# Deploy seguro: Cloudflare + Render + Supabase

## Arquitetura escolhida

```text
GitHub
  ├─ Cloudflare Worker: arquivos estáticos do Next.js e proxy /api
  └─ Render: API NestJS, Prisma, sharp e migrations
                         ├─ Supabase PostgreSQL
                         └─ Supabase Storage privado
```

Esta divisão evita reescrever a API NestJS para um runtime edge. O navegador acessa sempre uma única origem Cloudflare; o Worker encaminha `/api/*` ao Render, preservando cookies HttpOnly/Secure/SameSite e evitando CORS cruzado no navegador.

## 1. Preparar o Supabase

1. Crie o projeto, preferencialmente na região mais próxima dos usuários.
2. Em **Connect**, use o **Session pooler** (porta 5432) como `DATABASE_URL` do Render. Em `DIRECT_URL`, use a conexão direta quando o provedor suportar IPv6; caso contrário, use também o Session pooler 5432. O Transaction pooler 6543 é indicado para runtimes serverless/autoscaling, não para esta API Node persistente.
3. Use um usuário de banco dedicado ao Prisma e uma senha gerada por gerenciador de senhas.
4. Como o frontend não usa Supabase JS, REST ou GraphQL, desative **Enable Data API** em **Project Settings → Data API**. Isso reduz a superfície de exposição das tabelas; o Storage continua sendo chamado pela API.
5. Em **Storage**, crie `os-photos` como bucket **privado**. Restrinja o MIME a `image/webp` e defina limite compatível com as imagens processadas. O backend valida a entrada em 10 MB e grava somente WebP.
6. Copie a URL do projeto e a chave secreta/service role. Ela irá apenas ao Render.

Não coloque connection strings, chaves service role, `JWT_SECRET` ou `PIN_ENCRYPTION_KEY` em variáveis públicas do frontend, no GitHub ou no `wrangler.jsonc`.

## 2. Publicar a API no Render

1. No Render, escolha **New → Blueprint** e conecte o repositório GitHub. O arquivo `render.yaml` da raiz cria `oled-api`.
2. Preencha:
   - `DATABASE_URL` e `DIRECT_URL`;
   - `JWT_SECRET` com pelo menos 32 caracteres aleatórios;
   - `PIN_ENCRYPTION_KEY` com exatamente 64 caracteres hexadecimais;
   - `ADMIN_EMAIL`, `ADMIN_NAME` e `ADMIN_PASSWORD`;
   - `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`;
   - `EDGE_PROXY_SECRET` com pelo menos 32 bytes aleatórios;
   - `FRONTEND_ORIGIN=https://frontend-temporario.invalid` no primeiro deploy.
3. Aguarde o build e abra `https://SEU-SERVICO.onrender.com/health`. A resposta esperada é `{ "status": "ok" }`.
4. Na primeira implantação, execute o seed pelo Shell do Render ou de uma máquina segura com as mesmas variáveis: `npm run build:api && npm run db:seed`.

O start do Blueprint executa `prisma migrate deploy` antes da API. Não use `prisma migrate reset` nem `db push` em produção.

## 3. Publicar o frontend na Cloudflare

Na raiz do repositório:

```bash
npm ci
npx wrangler login
npm run deploy:cloudflare
```

O comando cria a exportação estática em `frontend/out` e publica o Worker definido em `wrangler.jsonc`. Depois, em **Workers & Pages → oled-assistencia → Settings → Variables and Secrets**, adicione:

```text
API_ORIGIN=https://SEU-SERVICO.onrender.com
EDGE_PROXY_SECRET=O_MESMO_VALOR_CONFIGURADO_NO_RENDER
```

Use somente a origem, sem `/api` e sem barra final. Cadastre `EDGE_PROXY_SECRET` como **Secret** nos dois provedores; o Worker remove qualquer valor enviado pelo navegador e insere o segredo correto antes de chamar a API. Com ele definido no Render, apenas `/health` continua acessível diretamente.

Para testar localmente o Worker, copie `.dev.vars.example` para `.dev.vars`, ajuste `API_ORIGIN` e rode `npm run preview:cloudflare`.

## 4. Fechar CORS, cookies e domínio

1. Copie a origem publicada pela Cloudflare, por exemplo `https://oled-assistencia.usuario.workers.dev`.
2. No Render, substitua `FRONTEND_ORIGIN` por essa origem exata e redeploye.
3. Abra `https://SUA-ORIGEM/api/health` e confirme o status.
4. Teste login, renovação da sessão, criação de OS e upload/visualização de fotos.
5. Se usar domínio próprio, associe-o ao Worker e depois mude `FRONTEND_ORIGIN` no Render para `https://seu-dominio`. Não mantenha duas origens diferentes em produção.

## 5. Deploy automático pelo GitHub

No Cloudflare Workers Builds, conecte o repositório com:

```text
Root directory: /
Build command: npm ci && npm run build:cloudflare
Deploy command: npx wrangler deploy
```

Cadastre `API_ORIGIN` e `EDGE_PROXY_SECRET` nas variáveis do projeto Cloudflare. No Render, o Blueprint já usa auto deploy na branch conectada.

## 6. Checklist antes de liberar usuários

- `npm audit --omit=dev --audit-level=high` sem vulnerabilidades conhecidas.
- `npm run build`, `npm run lint:web` e `npm run typecheck:web` aprovados.
- `/health` direto no Render e `/api/health` pela Cloudflare aprovados.
- Bucket `os-photos` privado; Data API desativada se não utilizada.
- Login exige troca da senha inicial; Swagger desativado.
- Domínio HTTPS e `FRONTEND_ORIGIN` idênticos.
- Backup do banco habilitado e restauração testada.
- `PIN_ENCRYPTION_KEY` armazenada no cofre de segredos e em backup seguro separado.

## 7. Rollback

Cloudflare e Render mantêm versões/deploys anteriores. Se um release falhar, restaure a versão anterior nos dois painéis. Migrations devem ser aditivas; não reverta banco apagando tabelas ou volumes. Antes de mudanças destrutivas, crie e teste um backup do Supabase.

## Hospedar também o backend na Cloudflare?

É tecnicamente possível com Cloudflare Containers (plano Workers Paid) porque a API depende de Node, Prisma, `sharp` e filesystem temporário. Para a primeira produção, Render é mais simples e reduz risco operacional. Migrar a API diretamente para Workers exigiria adaptar runtime e conexão do Prisma; não é necessário para obter CDN, HTTPS, domínio e proteção da Cloudflare no frontend.
