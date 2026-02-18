# Chat Module (`/api/v1`)

Módulo de chat multi-agente estilo inbox com Fastify + Prisma + Socket.IO.

## Variáveis de ambiente

- `DATABASE_URL` (obrigatória)
- `JWT_SECRET` (obrigatória para autenticação HTTP/WS)
- `REDIS_URL` (opcional, habilita adapter Redis do Socket.IO se `redis` + `@socket.io/redis-adapter` estiverem instalados)

## Rotas HTTP

Base: `/api/v1`

- `GET /organizations/:orgId/inboxes`
- `POST /organizations/:orgId/inboxes`
- `POST /organizations/:orgId/contacts`
- `POST /organizations/:orgId/conversations`
- `GET /organizations/:orgId/inboxes/:inboxId/conversations?status=&assignee=me|unassigned|all&search=&cursor=&limit=`
- `GET /organizations/:orgId/conversations/:conversationId?cursor=&limit=`
- `POST /organizations/:orgId/conversations/:conversationId/messages`
- `POST /organizations/:orgId/conversations/:conversationId/assign`
- `POST /organizations/:orgId/conversations/:conversationId/status`
- `POST /organizations/:orgId/conversations/:conversationId/update_last_seen`

## Eventos Socket.IO

Conexão:

- path: `/socket.io`
- autenticação: cookie `access_token` (JWT)

Client -> Server:

- `join:inbox` `{ inboxId }`
- `leave:inbox` `{ inboxId }`
- `join:conversation` `{ conversationId }`
- `leave:conversation` `{ conversationId }`
- `typing:start` `{ conversationId }`
- `typing:stop` `{ conversationId }`
- `message:send` `{ conversationId, content }`
- `conversation:assign` `{ conversationId }`
- `conversation:status` `{ conversationId, status }`
- `conversation:last_seen` `{ conversationId }`

Server -> Client:

- `conversation:created`
- `conversation:updated`
- `message:created`
- `typing:updated`
- `presence:updated`
- `unread:updated`

Rooms:

- `org:{organizationId}`
- `inbox:{inboxId}`
- `conv:{conversationId}`
- `user:{userId}`

## Exemplos de payload

### Criar inbox

```json
{
  "name": "Suporte"
}
```

### Criar contato

```json
{
  "name": "Maria Cliente",
  "externalId": "crm-1020"
}
```

### Criar conversa

```json
{
  "inboxId": 1,
  "contactId": 1,
  "content": "Olá, preciso de ajuda com meu pedido"
}
```

### Enviar mensagem

```json
{
  "content": "Perfeito, vou te ajudar agora."
}
```

### Atualizar status

```json
{
  "status": "pending"
}
```

## Observações

- Assign (`/assign`) é transacional e retorna `409` se já tiver sido assumida por outro agente.
- `update_last_seen` e `conversation:last_seen` zeram unread do usuário atual e disparam `unread:updated` no room `user:{userId}`.
- Presença online/offline é emitida no room da organização.
- Seed opcional de dados de teste: `src/modules/chat/examples/seed-chat.sql`.
