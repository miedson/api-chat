# ia-api-core

API de atendimento multi-canal com autenticação delegada para a `api-auth`.

## Visão geral

- Registro, login e verificação de e-mail são executados pela `api-auth`.
- Este serviço mantém os dados de domínio (organização, usuários locais, embeddings e canais).
- Credenciais de aplicação (`applicationSlug`/`applicationSecret`) **não são enviadas pelo cliente**; são lidas de variáveis de ambiente.

## Stack

- Fastify 5 + Zod
- Prisma + PostgreSQL
- Qdrant (busca vetorial)
- Serviço externo de embeddings
- Evolution API (canal WhatsApp)

## Executar

```bash
pnpm install
cp .env.development .env
pnpm prisma generate
pnpm prisma migrate deploy
pnpm dev
```

## Build

```bash
pnpm build
pnpm start
```

## Variáveis de ambiente

### Core

- `APP_PORT`
- `APP_HOST`
- `APP_PUBLIC_URL` (usado para registrar webhook de canais)
- `JWT_SECRET`
- `COOKIE_SECRET`
- `DATABASE_URL`
- `QDRANT_URL`
- `EMBEDDING_URL`
- `DOMAIN`
- `SUPPORT_EMAIL_DEFAULT`
- `EVO_API_URL`
- `EVO_API_TOKEN`
- `EVO_WEBHOOK_SECRET` (segredo esperado em `x-webhook-secret` no webhook)
- `WHATSAPP_WEBHOOK_PUBLIC_URL` (URL pública base para registrar webhook na Evolution)
- `META_APP_ID`
- `META_APP_SECRET`
- `META_GRAPH_API_URL` (opcional, default `https://graph.facebook.com/v23.0`)
- `INSTAGRAM_OAUTH_REDIRECT_URI` (URL pública do frontend callback, ex.: `https://app.seudominio.com/integracoes/instagram/callback`)
- `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` (token de validação do webhook no Meta)

### Integração com api-auth

- `AUTH_API_URL`
- `AUTH_API_JWKS_URL` (default: `${AUTH_API_URL}/.well-known/jwks.json`)
- `AUTH_API_EXPECTED_AUDIENCE` (default: `api-chat`)
- `AUTH_API_EXPECTED_ISSUER` (default: `AUTH_API_URL`)
- `AUTH_API_APPLICATION_SLUG`
- `AUTH_API_APPLICATION_SECRET`
- `AUTH_API_ROOT_EMAIL`
- `AUTH_API_ROOT_PASSWORD`
- `AUTH_API_PROVISIONING_SECRET`

### Paths opcionais da api-auth

- `AUTH_API_REGISTER_PATH` (default: `/api/v1/register`)
- `AUTH_API_LOGIN_PATH` (default: `/api/v1/login`)
- `AUTH_API_VERIFY_EMAIL_PATH` (default: `/api/v1/verify-email`)
- `AUTH_API_ADMIN_PATH_PREFIX` (default: `/api/v1/admin/applications`)

## Autenticação no core

- Rotas públicas usam `config.public: true`.
- Rotas privadas exigem cookie `access_token`.
- Login no core define cookies `access_token` e `refresh_token`.

## Endpoints

Base: `/{prefix}` definido em `src/routes/index.ts`.

### Auth (`/auth`)

#### `POST /auth/register`

Cria conta na `api-auth` e registra organização/usuário local.

Body:

```json
{
  "name": "Usuário Admin",
  "displayName": "Admin",
  "email": "admin@empresa.com",
  "password": "Senha@123",
  "organization": {
    "name": "Empresa X",
    "document": "12345678909",
    "phone": "+55 11 99999-9999"
  }
}
```

Resposta:

- `201` `{"status":"created","message":"..."}`
- `202` `{"status":"verification_required","message":"..."}`

#### `POST /auth/login`

Autentica na `api-auth` usando credenciais do usuário.

Body:

```json
{
  "email": "admin@empresa.com",
  "password": "Senha@123"
}
```

Resposta `201`:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_in": 900,
  "user": {
    "id": "uuid",
    "name": "Usuário Admin",
    "displayName": "Admin",
    "email": "admin@empresa.com"
  },
  "application": {
    "id": "uuid",
    "name": "Minha Aplicação",
    "slug": "minha-aplicacao",
    "role": "admin"
  }
}
```

#### `POST /auth/verify-email`

Valida código de e-mail na `api-auth`.

Body:

```json
{
  "email": "admin@empresa.com",
  "code": "123456"
}
```

Resposta: `204`.

#### `POST /auth/verify-email-and-grant-access`

Verifica e-mail e concede acesso do usuário à aplicação na `api-auth`.

Body:

```json
{
  "email": "admin@empresa.com",
  "code": "123456",
  "userPublicId": "uuid-do-usuario-na-api-auth",
  "role": "admin",
  "provisioningSecret": "segredo-de-provisionamento"
}
```

Resposta: `204`.

Observação: `provisioningSecret` deve ser igual a `AUTH_API_PROVISIONING_SECRET`.

### Users (`/users`)

#### `GET /users`

Lista usuários locais da organização.

#### `POST /users`

Cria usuário na `api-auth` e no banco local.

Body:

```json
{
  "name": "Agente 1",
  "displayName": "Atendimento",
  "email": "agente@empresa.com",
  "password": "Senha@123",
  "organizationId": 1,
  "role": "agent"
}
```

Resposta: `201`.

### IA (`/ia`)

- `POST /ia/embed`
- `GET /ia/search`

### Channel (`/channel`)

- `GET /channel`
- `POST /channel/whatsapp/connect`
- `POST /channel/instagram/connect`
- `GET /channel/instagram/oauth/url`
- `GET /channel/instagram/oauth/exchange`
- `GET /channel/instagram/webhook` (verificação Meta)
- `POST /channel/instagram/webhook`
- `POST /channel/:connectionId/webhook/sync`
- `POST /channel/whatsapp/webhook/evolution` (publica; requer `x-webhook-secret`)

### Conversations (`/conversations`)

- `GET /conversations`
- `POST /conversations`
- `GET /conversations/:conversationId/messages`
- `POST /conversations/:conversationId/messages`

### Socket.IO

Servidor Socket.IO no mesmo host/porta da API.

Eventos:

- `conversation:join` (cliente -> servidor)
- `conversation:leave` (cliente -> servidor)
- `conversation:message:send` (cliente -> servidor)
- `conversation:new` (servidor -> cliente)
- `conversation:message:new` (servidor -> cliente)

## Documentação OpenAPI

- Scalar/Swagger: `http://{APP_HOST}:{APP_PORT}/docs`

## Banco de dados

Depois de atualizar código/migrations:

```bash
pnpm prisma generate
pnpm prisma migrate deploy
```

## Notas de arquitetura

- O reset de senha é totalmente responsabilidade da `api-auth`.
- O core não persiste hash de senha e não mantém tokens de reset locais.
- As colunas de Chatwoot também foram removidas.
