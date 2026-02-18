import { errorSchema } from '@/app/common/schemas/error.schema'
import type { FastifyTypeInstance } from '@/types'
import type { Server } from 'socket.io'
import z from 'zod'
import {
  type ChatUser,
  ChatService,
  HttpError,
} from './chat.service'
import {
  contactSchema,
  conversationDetailSchema,
  conversationListItemSchema,
  conversationParamsSchema,
  conversationSchema,
  createContactInputSchema,
  createConversationInputSchema,
  createInboxInputSchema,
  inboxParamsSchema,
  inboxSchema,
  listConversationsQuerySchema,
  listMessagesQuerySchema,
  messageInputSchema,
  messageSchema,
  orgParamsSchema,
  statusInputSchema,
} from './chat.schemas'

const unauthorizedError = new HttpError(401, 'Unauthorized')

const mapError = (error: unknown) => {
  if (error instanceof HttpError) {
    return error
  }

  if (error instanceof Error) {
    return new HttpError(500, error.message)
  }

  return new HttpError(500, 'Unexpected error')
}

const ensureChatUser = async (
  chatService: ChatService,
  request: { user?: { sub?: string } },
): Promise<ChatUser> => {
  const publicId = request.user?.sub

  if (!publicId) {
    throw unauthorizedError
  }

  return chatService.getRequestUser(publicId)
}

export const registerChatRoutes = async (
  app: FastifyTypeInstance,
  chatService: ChatService,
  io: Server,
) => {
  const emitConversationUpdated = (payload: {
    conversationId: number
    organizationId: number
    inboxId: number
    assigneeId: number | null
    status: 'open' | 'pending' | 'resolved'
    lastActivityAt: Date
  }) => {
    io.to(`conv:${payload.conversationId}`).emit('conversation:updated', payload)
    io.to(`inbox:${payload.inboxId}`).emit('conversation:updated', payload)
    io.to(`org:${payload.organizationId}`).emit('conversation:updated', payload)
    if (payload.assigneeId) {
      io.to(`user:${payload.assigneeId}`).emit('conversation:updated', payload)
    }
  }

  app.get(
    '/organizations/:orgId/inboxes',
    {
      schema: {
        tags: ['chat'],
        summary: 'Listar inboxes por organização',
        params: orgParamsSchema,
        response: {
          200: z.array(inboxSchema),
          401: errorSchema,
          403: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const user = await ensureChatUser(chatService, request)
        const { orgId } = request.params
        chatService.assertOrganizationAccess(user, orgId)

        const inboxes = await chatService.listInboxes(orgId)
        return reply.code(200).send(inboxes)
      } catch (error) {
        const knownError = mapError(error)
        return reply.code(knownError.statusCode).send({ message: knownError.message })
      }
    },
  )

  app.post(
    '/organizations/:orgId/inboxes',
    {
      schema: {
        tags: ['chat'],
        summary: 'Criar inbox',
        params: orgParamsSchema,
        body: createInboxInputSchema,
        response: {
          201: inboxSchema,
          401: errorSchema,
          403: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const user = await ensureChatUser(chatService, request)
        const { orgId } = request.params
        chatService.assertOrganizationAccess(user, orgId)

        const inbox = await chatService.createInbox(orgId, request.body.name)
        return reply.code(201).send(inbox)
      } catch (error) {
        const knownError = mapError(error)
        return reply.code(knownError.statusCode).send({ message: knownError.message })
      }
    },
  )

  app.post(
    '/organizations/:orgId/contacts',
    {
      schema: {
        tags: ['chat'],
        summary: 'Criar contato',
        params: orgParamsSchema,
        body: createContactInputSchema,
        response: {
          201: z.object({
            id: z.number().int(),
            organizationId: z.number().int(),
            name: z.string(),
            externalId: z.string().nullable(),
            createdAt: z.date(),
            updatedAt: z.date(),
          }),
          401: errorSchema,
          403: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const user = await ensureChatUser(chatService, request)
        const { orgId } = request.params
        chatService.assertOrganizationAccess(user, orgId)

        const contact = await chatService.createContact(orgId, request.body)
        return reply.code(201).send(contact)
      } catch (error) {
        const knownError = mapError(error)
        return reply.code(knownError.statusCode).send({ message: knownError.message })
      }
    },
  )

  app.post(
    '/organizations/:orgId/conversations',
    {
      schema: {
        tags: ['chat'],
        summary: 'Criar conversa',
        params: orgParamsSchema,
        body: createConversationInputSchema,
        response: {
          201: z.object({
            conversation: conversationSchema.extend({
              contact: contactSchema,
            }),
            message: messageSchema.nullable(),
          }),
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const user = await ensureChatUser(chatService, request)
        const { orgId } = request.params
        chatService.assertOrganizationAccess(user, orgId)

        const created = await chatService.createConversation(orgId, user.id, request.body)

        io.to(`inbox:${created.conversation.inboxId}`).emit('conversation:created', {
          conversation: created.conversation,
          contact: created.conversation.contact,
        })
        io.to(`org:${orgId}`).emit('conversation:created', {
          conversation: created.conversation,
          contact: created.conversation.contact,
        })

        if (created.message) {
          io.to(`conv:${created.conversation.id}`).emit('message:created', created.message)
        }

        return reply.code(201).send(created)
      } catch (error) {
        const knownError = mapError(error)
        return reply.code(knownError.statusCode).send({ message: knownError.message })
      }
    },
  )

  app.get(
    '/organizations/:orgId/inboxes/:inboxId/conversations',
    {
      schema: {
        tags: ['chat'],
        summary: 'Listar conversas por inbox',
        params: inboxParamsSchema,
        querystring: listConversationsQuerySchema,
        response: {
          200: z.object({
            items: z.array(conversationListItemSchema),
            nextCursor: z.number().int().nullable(),
          }),
          401: errorSchema,
          403: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const user = await ensureChatUser(chatService, request)
        const { orgId, inboxId } = request.params
        chatService.assertOrganizationAccess(user, orgId)

        await chatService.ensureInboxAccess(orgId, inboxId)

        const conversations = await chatService.listConversations({
          organizationId: orgId,
          inboxId,
          userId: user.id,
          assignee: request.query.assignee,
          status: request.query.status,
          search: request.query.search,
          cursor: request.query.cursor,
          limit: request.query.limit,
        })

        return reply.code(200).send(conversations)
      } catch (error) {
        const knownError = mapError(error)
        return reply.code(knownError.statusCode).send({ message: knownError.message })
      }
    },
  )

  app.get(
    '/organizations/:orgId/conversations/:conversationId',
    {
      schema: {
        tags: ['chat'],
        summary: 'Detalhar conversa e mensagens',
        params: conversationParamsSchema,
        querystring: listMessagesQuerySchema,
        response: {
          200: conversationDetailSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const user = await ensureChatUser(chatService, request)
        const { orgId, conversationId } = request.params
        chatService.assertOrganizationAccess(user, orgId)

        const data = await chatService.getConversationWithMessages({
          organizationId: orgId,
          conversationId,
          cursor: request.query.cursor,
          limit: request.query.limit,
        })

        return reply.code(200).send(data)
      } catch (error) {
        const knownError = mapError(error)
        return reply.code(knownError.statusCode).send({ message: knownError.message })
      }
    },
  )

  app.post(
    '/organizations/:orgId/conversations/:conversationId/messages',
    {
      schema: {
        tags: ['chat'],
        summary: 'Enviar mensagem outbound',
        params: conversationParamsSchema,
        body: messageInputSchema,
        response: {
          201: messageSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const user = await ensureChatUser(chatService, request)
        const { orgId, conversationId } = request.params
        chatService.assertOrganizationAccess(user, orgId)

        const result = await chatService.sendAgentMessage({
          organizationId: orgId,
          conversationId,
          senderId: user.id,
          content: request.body.content,
        })

        io.to(`conv:${conversationId}`).emit('message:created', result.message)
        io.to(`inbox:${result.inboxId}`).emit('message:created', result.message)
        if (result.assigneeId) {
          io.to(`user:${result.assigneeId}`).emit('message:created', result.message)
        }

        emitConversationUpdated({
          conversationId: result.conversation.id,
          organizationId: result.conversation.organizationId,
          inboxId: result.conversation.inboxId,
          assigneeId: result.conversation.assigneeId,
          status: result.conversation.status,
          lastActivityAt: result.conversation.lastActivityAt,
        })

        return reply.code(201).send(result.message)
      } catch (error) {
        const knownError = mapError(error)
        return reply.code(knownError.statusCode).send({ message: knownError.message })
      }
    },
  )

  app.post(
    '/organizations/:orgId/conversations/:conversationId/assign',
    {
      schema: {
        tags: ['chat'],
        summary: 'Assumir conversa',
        params: conversationParamsSchema,
        response: {
          200: z.object({
            id: z.number().int(),
            assigneeId: z.number().int().nullable(),
            status: z.enum(['open', 'pending', 'resolved']),
            organizationId: z.number().int(),
            inboxId: z.number().int(),
            lastActivityAt: z.date(),
          }),
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const user = await ensureChatUser(chatService, request)
        const { orgId, conversationId } = request.params
        chatService.assertOrganizationAccess(user, orgId)

        const conversation = await chatService.assignConversation({
          organizationId: orgId,
          conversationId,
          assigneeId: user.id,
        })

        emitConversationUpdated({
          conversationId: conversation.id,
          organizationId: conversation.organizationId,
          inboxId: conversation.inboxId,
          assigneeId: conversation.assigneeId,
          status: conversation.status,
          lastActivityAt: conversation.lastActivityAt,
        })

        return reply.code(200).send(conversation)
      } catch (error) {
        const knownError = mapError(error)
        return reply.code(knownError.statusCode).send({ message: knownError.message })
      }
    },
  )

  app.post(
    '/organizations/:orgId/conversations/:conversationId/status',
    {
      schema: {
        tags: ['chat'],
        summary: 'Atualizar status da conversa',
        params: conversationParamsSchema,
        body: statusInputSchema,
        response: {
          200: z.object({
            id: z.number().int(),
            assigneeId: z.number().int().nullable(),
            status: z.enum(['open', 'pending', 'resolved']),
            organizationId: z.number().int(),
            inboxId: z.number().int(),
            lastActivityAt: z.date(),
          }),
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const user = await ensureChatUser(chatService, request)
        const { orgId, conversationId } = request.params
        chatService.assertOrganizationAccess(user, orgId)

        const conversation = await chatService.updateConversationStatus({
          organizationId: orgId,
          conversationId,
          status: request.body.status,
        })

        emitConversationUpdated({
          conversationId: conversation.id,
          organizationId: conversation.organizationId,
          inboxId: conversation.inboxId,
          assigneeId: conversation.assigneeId,
          status: conversation.status,
          lastActivityAt: conversation.lastActivityAt,
        })

        return reply.code(200).send(conversation)
      } catch (error) {
        const knownError = mapError(error)
        return reply.code(knownError.statusCode).send({ message: knownError.message })
      }
    },
  )

  app.post(
    '/organizations/:orgId/conversations/:conversationId/update_last_seen',
    {
      schema: {
        tags: ['chat'],
        summary: 'Atualizar last_seen da conversa para o usuário atual',
        params: conversationParamsSchema,
        response: {
          200: z.object({
            conversationId: z.number().int(),
            unreadCount: z.number().int(),
            lastSeenMessageId: z.number().int().nullable(),
            lastSeenAt: z.date(),
          }),
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const user = await ensureChatUser(chatService, request)
        const { orgId, conversationId } = request.params
        chatService.assertOrganizationAccess(user, orgId)

        const read = await chatService.markConversationLastSeen({
          organizationId: orgId,
          conversationId,
          userId: user.id,
        })

        io.to(`user:${user.id}`).emit('unread:updated', {
          conversationId,
          unreadCount: read.unreadCount,
        })

        return reply.code(200).send(read)
      } catch (error) {
        const knownError = mapError(error)
        return reply.code(knownError.statusCode).send({ message: knownError.message })
      }
    },
  )
}
