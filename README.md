# OLED — Gestão de assistência técnica

Aplicação em português para atendimento de celulares e eletrônicos. Frontend Next.js + React + TypeScript, API NestJS, PostgreSQL e Prisma. Dados operacionais são persistidos no servidor; não há banco simulado nem cadastros demonstrativos.

O modo local usa PostgreSQL e arquivos em disco via Docker. Em produção, a arquitetura preparada é frontend estático + proxy na Cloudflare Workers, API Node no Render e banco + fotos no Supabase (PostgreSQL e Storage privado), detalhados em **Produção e deploy**.

## Stack

- **Frontend:** Next.js 16 (React 19) com proxy `/api` para o backend.
- **Backend:** NestJS 11 sobre Express 5.
- **Banco:** Prisma 6 + PostgreSQL local ou Supabase.
- **Imagens:** sharp, com conversão para WebP e miniaturas.
- **Execução:** Docker Compose para o ambiente local completo.

## Requisitos

- Docker Engine e Docker Compose v2, ou Node.js 22+ e PostgreSQL 17+.
- Acesso à internet para a primeira instalação.
- Conta no Supabase apenas para banco e fotos hospedados (opcional no modo local).
- HTTPS para uso da câmera em dispositivos móveis fora de `localhost`.

## Iniciar com Docker

1. Copie `.env.example` para `.env`.
2. Configure `POSTGRES_PASSWORD`, `JWT_SECRET`, `PIN_ENCRYPTION_KEY`, `ADMIN_PASSWORD` e `DIRECT_URL`. No modo local, `DIRECT_URL` é igual à `DATABASE_URL`. Use uma senha de banco composta por caracteres alfanuméricos para simplificar a URL no Compose. Não publique o arquivo `.env`.
3. Mantenha `ADMIN_EMAIL=admin.oled@gmail.com` e informe em `ADMIN_PASSWORD` a senha inicial solicitada. Ela é usada somente pelo seed e armazenada como hash bcrypt. O primeiro acesso exige a troca da senha.
4. Execute `docker compose up --build -d`.
5. Acesse **http://localhost:3000**. A API fica acessível pelo mesmo endereço em `/api`; o banco e a API não expõem portas públicas.

O serviço `migrate` aplica as migrations e executa o seed antes de liberar o backend. O frontend só inicia depois do health check do backend. Reexecutar o seed não altera a senha de um usuário existente. Os volumes `postgres_data` e `photos` preservam banco e fotos entre reinicializações. Evite `docker compose down -v`, que apaga os volumes.

Os serviços `migrate` e `backend` usam a `DATABASE_URL` do `.env` quando ela está definida; isso permite apontar os contêineres para o Supabase em vez do Postgres local (defina também `DIRECT_URL` com a conexão direta), embora o serviço `database` continue subindo.

Gere os segredos com Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(40).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use o primeiro resultado em `JWT_SECRET` e o segundo em `PIN_ENCRYPTION_KEY`.

## Iniciar sem Docker

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run build:api
npm run db:seed
npm run dev:api
```

Em outro terminal:

```bash
npm run dev:web
```

Configure `DATABASE_URL` e `DIRECT_URL` — no local, ambas iguais — para um banco PostgreSQL criado previamente, `FRONTEND_ORIGIN` para a origem exata do frontend e `API_INTERNAL_URL=http://127.0.0.1:4000`. `localhost` e `127.0.0.1` são origens diferentes: escolha uma e use-a de forma consistente.

O comando `dev:api` compila e inicia a API; reinicie-o após alterações no backend. O Next.js atualiza automaticamente o frontend durante o desenvolvimento.

## Variáveis

| Variável | Uso |
|---|---|
| `DATABASE_URL` | Conexão PostgreSQL usada pelo Prisma em execução; local, o Postgres do Compose; no Render, Supabase Session Pooler (porta 5432) |
| `DIRECT_URL` | Conexão usada pelo Prisma para migrations (`directUrl` no schema); local, igual à `DATABASE_URL`; Supabase, conexão direta ou Session Pooler 5432 |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Credenciais do Postgres local do Compose |
| `JWT_SECRET` | Assinatura dos tokens de acesso; mínimo de 32 caracteres. Somente servidor |
| `PIN_ENCRYPTION_KEY` | Chave AES-256-GCM, 64 caracteres hexadecimais. Somente servidor |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Administrador inicial criado pelo seed. Somente servidor |
| `FRONTEND_ORIGIN` | Origem exata autorizada para CORS e solicitações de escrita. Somente servidor |
| `API_INTERNAL_URL` | Destino do proxy Next.js; definido também durante o build |
| `EDGE_PROXY_SECRET` | Segredo compartilhado Cloudflare → Render; quando definido, bloqueia acesso direto à API (exceto `/health`) |
| `PHOTO_STORAGE` | `local` (padrão, usa `UPLOAD_DIR`) ou `supabase` (Supabase Storage). Somente servidor |
| `SUPABASE_URL` | URL do projeto Supabase, sem barra final; usada se `PHOTO_STORAGE=supabase`. Somente servidor |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service role do Supabase. Segredo de servidor: **nunca** vai ao frontend |
| `SUPABASE_STORAGE_BUCKET` | Bucket privado das fotos; padrão `os-photos` |
| `UPLOAD_DIR` | Diretório privado de fotos e miniaturas; apenas no modo local |
| `SWAGGER_ENABLED` | Habilita documentação em `/api/docs`; padrão seguro `false` |
| `TRUST_PROXY` | Configuração do Express `trust proxy`; mantenha `false` salvo quando houver proxy HTTPS confiável encaminhando IP/protocolo |
| `NODE_ENV` | `development` local; `production` com HTTPS |
| `PORT` | Porta interna da API, padrão 4000 |

Tudo o que envolve banco, segredos e storage é exclusivo do servidor; o frontend não recebe nenhuma dessas variáveis. `SUPABASE_SERVICE_ROLE_KEY` concede acesso total ao projeto Supabase e jamais pode ser exposta ao navegador.

## Banco Supabase

Para usar o PostgreSQL gerenciado do Supabase no lugar do Postgres local:

1. Crie um projeto em [supabase.com](https://supabase.com), escolhendo uma região próxima aos usuários e uma senha forte de banco.
2. No painel, em **Connect**, copie a connection string do **Session pooler** (porta 5432) e use-a como `DATABASE_URL` no backend persistente do Render.
3. Use a conexão direta como `DIRECT_URL` se o provedor tiver IPv6; caso contrário, use também o Session pooler 5432. O Transaction pooler 6543 fica reservado a runtimes serverless/autoscaling.
4. Aplique o schema e o seed:

   ```bash
   npx prisma migrate deploy
   npm run db:seed
   ```

   O `migrate deploy` usa `DIRECT_URL`. O seed cria o administrador inicial e as configurações; é idempotente e não sobrescreve a senha de um usuário existente.
5. Não use `prisma db push` nem `prisma migrate reset` no banco de produção: migrations são a única via de alteração de schema.

Como esta arquitetura mantém o NestJS em um serviço Node persistente, ela usa o Session pooler 5432. Credenciais não existem no código — apenas no `.env` ou no ambiente do serviço hospedado. Se o aplicativo não usar REST/GraphQL do Supabase, desative a **Data API** no painel; o Storage continua acessado somente pelo backend.

## Storage de fotos

Em produção, o armazenamento em disco é substituído pelo Supabase Storage:

1. No projeto Supabase, crie um bucket **privado** chamado `os-photos` (seção Storage). Bucket público expõe as fotos das OS.
2. Defina no backend: `PHOTO_STORAGE=supabase`, `SUPABASE_URL` (sem barra final), `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_STORAGE_BUCKET=os-photos`.

As fotos continuam privadas: nenhuma URL pública é gerada. Elas são servidas por `GET /photos/:id`, endpoint autenticado — o contrato para o frontend não muda. `UPLOAD_DIR` é usado apenas no modo local (volume `photos` no Compose); com `PHOTO_STORAGE=supabase` ele é ignorado.

## Fluxo de atendimento

1. Entre com o administrador e troque a senha inicial.
2. Em **Configurações**, revise nome, contatos, termos, garantia e prefixo da OS.
3. Cadastre a equipe, fornecedores e produtos. Lance uma entrada de estoque para disponibilizar peças.
4. Clique em **Nova OS** e procure o cliente pelo nome ou telefone. Um novo cliente exige apenas nome e telefone. Se o telefone existir, selecione o cadastro encontrado.
5. Selecione ou cadastre o aparelho, informe o problema e registre estado físico, acessórios, checklist e fotos de entrada.
6. Na OS, registre diagnóstico e técnico, adicione serviços, mão de obra e peças ao orçamento.
7. Confirme a aprovação do cliente. A aprovação baixa as peças em uma transação; estoque insuficiente cancela toda a operação.
8. Altere o status para **Em reparo**. Registre uma foto na categoria **Finalização**.
9. Clique em **Finalizar OS**. A API verifica a foto e o orçamento aprovado antes de alterar para **Aguardando retirada**.
10. Registre os pagamentos, inclusive parciais. A entrega exige quitação e confirmação do cliente.
11. A entrega registra responsável e horário, inicia a garantia e remove o PIN armazenado do aparelho.

Uma foto de entrada ou reparo não substitui a foto de finalização. O bloqueio existe na API: não é possível contorná-lo alterando o status diretamente. O cancelamento é restrito ao administrador, devolve peças ao estoque e não é permitido quando há pagamentos registrados.

## Perfis

| Recurso | Administrador | Técnico | Atendente |
|---|---|---|---|
| Consultar / abrir OS | Sim | Sim | Sim |
| Cadastrar clientes e aparelhos | Sim | — | Sim |
| Diagnóstico, serviços, peças e orçamento | Sim | Sim | — |
| Foto de entrada | Sim | Sim | Sim |
| Fotos de reparo e finalização | Sim | Sim | — |
| Finalizar serviço | Sim | Sim | — |
| Registrar pagamento e entrega | Sim | — | Sim |
| Consultar preços de telas | Sim | Sim | Sim |
| Alterar preços e estoque | Sim | — | — |
| Equipe, fornecedores, financeiro, relatórios e auditoria | Sim | — | — |

Usuários desativados perdem o acesso imediatamente. Alterar a senha ou encerrar a sessão revoga os tokens de acesso existentes.

## Organização

```text
backend/
  prisma/          # Modelo relacional, migrations e seed
  src/
    auth/          # Sessões, senha e cookies de autenticação
    common/        # Banco, RBAC, validação, criptografia e auditoria
    orders/        # Regras transacionais da OS e orçamento
    photos/        # Upload, compressão e provedores de armazenamento (local e Supabase)
    catalog/       # Clientes, aparelhos, produtos e fornecedores
    admin/         # Usuários, configurações e notificações
    reports/       # Dashboard, busca global e relatórios
  tests/           # Integração por HTTP com PostgreSQL real
frontend/
  app/             # Entrada Next.js, metadados e estilos
  components/      # Telas e controles reutilizáveis
  lib/             # Cliente HTTP e formatação
```

O `Database` é o acesso compartilhado do Prisma. Operações de estoque, pagamento, orçamento, garantia e status são executadas em transações serializáveis com repetição limitada em conflitos. Valores financeiros são inteiros em centavos.

## API e Swagger

Com `SWAGGER_ENABLED=true`, acesse **http://localhost:3000/api/docs**. Os endpoints são agrupados por módulo. A documentação é de desenvolvimento; por padrão fica desabilitada no Compose para não expor o catálogo de endpoints em produção. `GET /settings/public` é intencionalmente público e retorna apenas dados institucionais/termos necessários à abertura e impressão de OS.

O login envia cookies HttpOnly, SameSite=Strict, seguros quando `NODE_ENV=production`. Tokens de acesso expiram em 15 minutos. Refresh tokens aleatórios são armazenados somente como SHA-256, duram sete dias e são rotacionados no uso. Clientes REST também podem enviar `Authorization: Bearer TOKEN`; o navegador utiliza cookies. Escritas com cookies exigem o cabeçalho `Origin` autorizado.

Principais recursos: `/auth`, `/customers`, `/devices`, `/service-orders`, `/products`, `/screens`, `/stock/movement`, `/payments`, `/dashboard`, `/reports`, `/users`, `/settings`, `/notifications`, `/audit`, `/search` e `/health`.

## Health check

`GET /health` verifica a conexão da API com o banco de dados e responde `{ "status": "ok" }` quando a aplicação está pronta. Pelo proxy do frontend, use `GET /api/health`. O Compose usa o endpoint internamente antes de liberar o frontend.

Exemplo de abertura de OS:

```json
{
  "customerId": "UUID_DO_CLIENTE",
  "deviceId": "UUID_DO_APARELHO",
  "problem": "Tela quebrada",
  "physicalState": "Trinca no vidro",
  "accessories": ["Aparelho", "Capinha"],
  "checklist": { "Tela": "DANIFICADO" }
}
```

Upload: `POST /service-orders/:id/photos?type=FINALIZATION`, com `multipart/form-data` e campo `file`. Categorias: `ENTRY`, `REPAIR` e `FINALIZATION`. Imagens de até 10 MB são decodificadas, redimensionadas e convertidas para WebP; miniaturas têm até 360 pixels. Arquivos são privados e servidos por endpoint autenticado.

Pagamento: `POST /service-orders/:id/payments`, com `amountCents`, `method` e `idempotencyKey` UUID. Reenvie a mesma chave somente para a mesma operação. Finalização: `POST /service-orders/:id/finalize`, com `warrantyDays`. Entrega: `POST /service-orders/:id/deliver`, com `customerId`.

## Testes e build

Crie um banco **descartável** chamado `oled_test` e configure `DATABASE_URL` para ele antes de aplicar migrations e testar:

```bash
npm run db:migrate
npm test
```

Os testes se recusam a executar sem `oled_test` na conexão. Eles criam registros exclusivos e preservam o banco para inspeção; não execute contra o banco operacional. A suíte usa a API HTTP e verifica autenticação, RBAC, cliente sem CPF, duplicidade por telefone, aparelho, OS, upload, foto obrigatória, orçamento, baixa de estoque, pagamentos parciais, idempotência, entrega, início de garantia e auditoria.

```bash
npm run build
```

Gera o backend compilado e a versão de produção do frontend Next.

Para verificações estáticas do frontend:

```bash
npm run lint:web
npm run typecheck:web
```

## Impressão e relatórios

Na OS, **Imprimir** abre a impressão do navegador, que também permite salvar em PDF. O comprovante contém os dados da assistência, cliente, aparelho, serviços, peças, valores, pagamentos, garantia, termos da abertura e campo para assinatura física. Relatórios oferecem filtros e CSV compatível com Excel; células com prefixos de fórmula são escapadas. Consultas de relatório são limitadas a 5.000 OS, com aviso para reduzir o período.

## Produção e deploy

Arquitetura suportada:

```text
Navegador → Cloudflare Worker (frontend + /api) → Render (NestJS) → Supabase
```

O frontend é exportado estaticamente por `npm run build:cloudflare`. O Worker serve `frontend/out` e encaminha somente `/api/*` ao Render; assim os cookies HttpOnly continuam na mesma origem do navegador. O backend permanece Node completo, adequado ao Prisma e ao processamento de imagens com `sharp`. O `render.yaml` cria a API, aplica migrations e verifica banco + aplicação em `/health`.

Procedimento resumido:

1. No Supabase, crie o PostgreSQL e o bucket **privado** `os-photos`; desative a Data API se ela não será usada.
2. No Render, importe o repositório como **Blueprint**, preencha as variáveis marcadas `sync: false` e confirme `https://SEU-BACKEND/health`.
3. Na raiz do projeto, execute `npx wrangler login` e `npm run deploy:cloudflare`.
4. Nas variáveis do Worker, cadastre `API_ORIGIN=https://SEU-BACKEND.onrender.com` sem `/api` e sem barra final; cadastre também `EDGE_PROXY_SECRET` com o mesmo valor definido no Render.
5. No Render, defina `FRONTEND_ORIGIN` com a origem exata `https://...workers.dev` ou com seu domínio final e redeploye.
6. Teste `/api/health`, login, criação de OS e upload de foto. Depois associe o domínio em **Workers & Pages → Custom Domains** e atualize `FRONTEND_ORIGIN` se a origem mudar.

Para deploy automático pelo GitHub no Cloudflare Workers Builds, mantenha a raiz do repositório e use build `npm ci && npm run build:cloudflare` e deploy `npx wrangler deploy`. A única chave compartilhada com a Cloudflare é `EDGE_PROXY_SECRET`; nunca cadastre `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `PIN_ENCRYPTION_KEY` ou URLs com senha no frontend/Cloudflare: esses valores pertencem somente ao backend Render.

O guia completo, incluindo Supabase, variáveis, domínio, validação e rollback, está em [docs/DEPLOY_CLOUDFLARE_SUPABASE.md](docs/DEPLOY_CLOUDFLARE_SUPABASE.md).

## Troubleshooting

- **`Environment variable not found: DIRECT_URL`** — adicione `DIRECT_URL` ao `.env`: no local, igual à `DATABASE_URL`; com Supabase, a conexão direta (porta 5432).
- **Migrations falham no Supabase via pooler** — o pooler (porta 6543) não serve para migrations; garanta `directUrl` no `schema.prisma` apontando para a conexão direta (porta 5432).
- **Erros de conexão local** — verifique se o contêiner `database` está saudável (`docker compose ps`) e se `POSTGRES_PASSWORD` é composta por caracteres alfanuméricos.
- **Upload falha com `PHOTO_STORAGE=supabase`** — confira se o bucket existe e é privado, se `SUPABASE_URL` está sem barra final e se a service role key é válida.
- **Cookies/login não persistem em produção** — exige `NODE_ENV=production` com HTTPS (cookies Secure) e `FRONTEND_ORIGIN` idêntica à origem do navegador.
- **`npm test` recusa executar** — a suíte exige `oled_test` na `DATABASE_URL`.

## Evolução prevista

- `PhotoStorage` separa operações de armazenamento da API. A implementação atual cobre disco local e Supabase Storage; uma implementação S3/R2 pode ser adicionada sem alterar o fluxo da OS.
- `OutboxEvent` registra eventos transacionais para futura integração com WhatsApp. Nenhuma mensagem externa é enviada nesta versão.
- A assinatura eletrônica ainda não possui captura nem validação; o comprovante fornece espaço para assinatura física. A evolução deve vincular o aceite à OS, etapa, usuário, data e versão dos termos.

Após rodar os testes, registre os resultados efetivamente obtidos e as pendências de validação para acompanhamento da entrega.
