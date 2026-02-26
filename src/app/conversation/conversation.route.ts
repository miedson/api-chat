import { errorSchema } from '@/app/common/schemas/error.schema'
import { getWhatsAppProvider } from '@/app/channel/services/whatsapp-provider.factory'
import { UserRepository } from '@/app/users/repositories/user.repository'
import { ChannelProviderType, ConversationStatus, MessageType } from '@/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import type { FastifyTypeInstance } from '@/types'
import z from 'zod'
import { mapConversation, mapMessage } from './serializers'
import {
  boardResponseSchema,
  conversationParamsSchema,
  conversationSchema,
  createMessageSchema,
  listMessagesQuerySchema,
  markConversationReadResponseSchema,
  messageSchema,
  transitionConversationStatusSchema,
} from './schemas/conversation.schema'

const userRepository = new UserRepository(prisma)

type AuthenticatedUser = {
  id: number
  publicId: string
  name: string
  displayName: string | null
  email: string
  organizationId: number
}

async function getAuthenticatedUserOrThrow(
  email: string,
): Promise<AuthenticatedUser> {
  const user = await userRepository.findByEmail(email)

  if (!user) {
    throw new Error('Authenticated user not found in local database')
  }

  return {
    id: user.id,
    publicId: user.public_id,
    name: user.name,
    displayName: user.displayName ?? null,
    email: user.email,
    organizationId: user.organizationId,
  }
}

const defaultConversationInclude = {
  assignedTo: {
    select: {
      public_id: true,
      name: true,
      displayName: true,
      email: true,
    },
  },
  participants: {
    include: {
      user: {
        select: {
          public_id: true,
          name: true,
          displayName: true,
          email: true,
        },
      },
    },
  },
  messages: {
    take: 1,
    orderBy: { createdAt: 'desc' as const },
    include: {
      sender: {
        select: {
          public_id: true,
          name: true,
          displayName: true,
        },
      },
    },
  },
}

export async function conversationRoutes(app: FastifyTypeInstance) {
  app.get(
    '/board',
    {
      schema: {
        tags: ['conversation'],
        summary: 'Kanban de conversas do atendente',
        response: {
          200: boardResponseSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const currentUser = await getAuthenticatedUserOrThrow(request.user.email)

        const awaiting = await prisma.conversation.findMany({
          where: {
            organizationId: currentUser.organizationId,
            status: ConversationStatus.open,
            assignedToId: null,
          },
          orderBy: { updatedAt: 'desc' },
          include: defaultConversationInclude,
        })

        const inProgress = await prisma.conversation.findMany({
          where: {
            organizationId: currentUser.organizationId,
            status: ConversationStatus.pending,
            assignedToId: currentUser.id,
          },
          orderBy: { updatedAt: 'desc' },
          include: defaultConversationInclude,
        })

        const completed = await prisma.conversation.findMany({
          where: {
            organizationId: currentUser.organizationId,
            status: ConversationStatus.resolved,
            assignedToId: currentUser.id,
          },
          orderBy: { updatedAt: 'desc' },
          include: defaultConversationInclude,
        })

        reply.status(200).send({
          awaiting: awaiting.map(mapConversation),
          inProgress: inProgress.map(mapConversation),
          completed: completed.map(mapConversation),
        })
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )

  app.get(
    '',
    {
      schema: {
        tags: ['conversation'],
        summary: 'Listar conversas atribuídas ao atendente',
        response: {
          200: z.array(conversationSchema),
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const currentUser = await getAuthenticatedUserOrThrow(request.user.email)

        const conversations = await prisma.conversation.findMany({
          where: {
            organizationId: currentUser.organizationId,
            assignedToId: currentUser.id,
          },
          orderBy: { updatedAt: 'desc' },
          include: defaultConversationInclude,
        })

        reply.status(200).send(conversations.map(mapConversation))
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )

  app.patch(
    '/:conversationId/status',
    {
      schema: {
        tags: ['conversation'],
        summary: 'Mover card de conversa no Kanban',
        params: conversationParamsSchema,
        body: transitionConversationStatusSchema,
        response: {
          200: conversationSchema,
          400: errorSchema,
          403: errorSchema,
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const currentUser = await getAuthenticatedUserOrThrow(request.user.email)
        const { toStatus } = request.body

        const conversation = await prisma.conversation.findFirst({
          where: {
            publicId: request.params.conversationId,
            organizationId: currentUser.organizationId,
          },
          include: defaultConversationInclude,
        })

        if (!conversation) {
          reply.status(404).send({ message: 'Conversation not found' })
          return
        }

        if (toStatus === ConversationStatus.open) {
          reply.status(400).send({ message: 'Conversation cannot return to awaiting' })
          return
        }

        if (conversation.status === ConversationStatus.open) {
          if (toStatus !== ConversationStatus.pending) {
            reply.status(400).send({ message: 'Invalid transition' })
            return
          }

          if (conversation.assignedToId && conversation.assignedToId !== currentUser.id) {
            reply.status(403).send({ message: 'Conversation already assigned to another agent' })
            return
          }

          const updated = await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              status: ConversationStatus.pending,
              assignedToId: currentUser.id,
            },
            include: defaultConversationInclude,
          })

          const payload = mapConversation(updated)
          app.io
            .to(`organization:${currentUser.organizationId}`)
            .emit('conversation:updated', payload)

          reply.status(200).send(payload)
          return
        }

        if (conversation.assignedToId !== currentUser.id) {
          reply.status(403).send({ message: 'Conversation is not assigned to current agent' })
          return
        }

        const validTransition =
          (conversation.status === ConversationStatus.pending &&
            toStatus === ConversationStatus.resolved) ||
          (conversation.status === ConversationStatus.resolved &&
            toStatus === ConversationStatus.pending)

        if (!validTransition) {
          reply.status(400).send({ message: 'Invalid transition' })
          return
        }

        const updated = await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            status: toStatus,
          },
          include: defaultConversationInclude,
        })

        const payload = mapConversation(updated)
        app.io
          .to(`organization:${currentUser.organizationId}`)
          .emit('conversation:updated', payload)

        reply.status(200).send(payload)
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )

  app.get(
    '/:conversationId/messages',
    {
      schema: {
        tags: ['conversation'],
        summary: 'Listar mensagens da conversa',
        params: conversationParamsSchema,
        querystring: listMessagesQuerySchema,
        response: {
          200: z.array(messageSchema),
          403: errorSchema,
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const currentUser = await getAuthenticatedUserOrThrow(request.user.email)

        const conversation = await prisma.conversation.findFirst({
          where: {
            publicId: request.params.conversationId,
            organizationId: currentUser.organizationId,
          },
          select: { id: true, assignedToId: true, status: true },
        })

        if (!conversation) {
          reply.status(404).send({ message: 'Conversation not found' })
          return
        }

        if (
          conversation.assignedToId !== currentUser.id ||
          conversation.status === ConversationStatus.open
        ) {
          reply.status(403).send({ message: 'Conversation is not assigned to current agent' })
          return
        }

        const messages = await prisma.message.findMany({
          where: {
            conversationId: conversation.id,
          },
          take: request.query.limit ?? 50,
          orderBy: { createdAt: 'asc' },
          include: {
            conversation: { select: { publicId: true } },
            sender: {
              select: {
                public_id: true,
                name: true,
                displayName: true,
              },
            },
          },
        })

        reply.status(200).send(messages.map(mapMessage))
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )

  app.post(
    '/:conversationId/read',
    {
      schema: {
        tags: ['conversation'],
        summary: 'Marcar mensagens recebidas como visualizadas',
        params: conversationParamsSchema,
        response: {
          200: markConversationReadResponseSchema,
          403: errorSchema,
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const currentUser = await getAuthenticatedUserOrThrow(request.user.email)

        const conversation = await prisma.conversation.findFirst({
          where: {
            publicId: request.params.conversationId,
            organizationId: currentUser.organizationId,
          },
          select: {
            id: true,
            status: true,
            assignedToId: true,
            externalContactId: true,
            channelConnection: {
              select: {
                provider: true,
                providerInstanceKey: true,
              },
            },
          },
        })

        if (!conversation) {
          reply.status(404).send({ message: 'Conversation not found' })
          return
        }

        if (
          conversation.assignedToId !== currentUser.id ||
          conversation.status === ConversationStatus.open
        ) {
          reply.status(403).send({ message: 'Conversation is not assigned to current agent' })
          return
        }

        const unreadIncoming = await prisma.$queryRaw<
          Array<{ externalMessageId: string | null }>
        >`SELECT external_message_id AS "externalMessageId"
           FROM messages
           WHERE conversation_id = ${conversation.id}
             AND type = 'incoming'
             AND read_at IS NULL
           ORDER BY created_at DESC`

        if (unreadIncoming.length === 0) {
          reply.status(200).send({ updatedCount: 0, providerNotified: false })
          return
        }

        const updatedCount = await prisma.$executeRaw`
          UPDATE messages
          SET read_at = NOW()
          WHERE conversation_id = ${conversation.id}
            AND type = 'incoming'
            AND read_at IS NULL
        `

        let providerNotified = false
        if (
          conversation.externalContactId &&
          conversation.channelConnection?.provider &&
          conversation.channelConnection.providerInstanceKey
        ) {
          const lastExternalMessageId =
            unreadIncoming.find((item) => !!item.externalMessageId)?.externalMessageId ??
            undefined

          try {
            const provider = getWhatsAppProvider(
              conversation.channelConnection.provider as ChannelProviderType,
            )

            await provider.markMessagesAsRead({
              instanceKey: conversation.channelConnection.providerInstanceKey,
              externalContactId: conversation.externalContactId,
              externalMessageId: lastExternalMessageId,
            })

            providerNotified = true
          } catch (error) {
            request.log.warn(
              {
                conversationId: request.params.conversationId,
                provider: conversation.channelConnection.provider,
                error: (error as Error).message,
              },
              'Failed to notify provider about read messages',
            )
          }
        }

        reply.status(200).send({
          updatedCount: Number(updatedCount),
          providerNotified,
        })
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )

  app.post(
    '/:conversationId/messages',
    {
      schema: {
        tags: ['conversation'],
        summary: 'Enviar mensagem para conversa atribuída',
        params: conversationParamsSchema,
        body: createMessageSchema,
        response: {
          201: messageSchema,
          403: errorSchema,
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const currentUser = await getAuthenticatedUserOrThrow(request.user.email)

        const conversation = await prisma.conversation.findFirst({
          where: {
            publicId: request.params.conversationId,
            organizationId: currentUser.organizationId,
          },
          select: {
            id: true,
            publicId: true,
            status: true,
            assignedToId: true,
            externalContactId: true,
            channelConnection: {
              select: {
                provider: true,
                providerInstanceKey: true,
              },
            },
          },
        })

        if (!conversation) {
          reply.status(404).send({ message: 'Conversation not found' })
          return
        }

        if (
          conversation.assignedToId !== currentUser.id ||
          conversation.status === ConversationStatus.open
        ) {
          reply.status(403).send({ message: 'Conversation is not assigned to current agent' })
          return
        }

        let externalMessageId: string | undefined

        if (
          (request.body.type ?? MessageType.outgoing) === MessageType.outgoing &&
          conversation.externalContactId &&
          conversation.channelConnection?.provider &&
          conversation.channelConnection.providerInstanceKey
        ) {
          const provider = getWhatsAppProvider(
            conversation.channelConnection.provider as ChannelProviderType,
          )
          const sentMessage = await provider.sendMessage({
            instanceKey: conversation.channelConnection.providerInstanceKey,
            to: conversation.externalContactId,
            text: request.body.content,
          })

          externalMessageId = sentMessage.externalMessageId
        }

        const message = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            senderId: currentUser.id,
            content: request.body.content,
            type: request.body.type ?? MessageType.outgoing,
            externalMessageId,
          },
          include: {
            conversation: { select: { publicId: true } },
            sender: {
              select: {
                public_id: true,
                name: true,
                displayName: true,
              },
            },
          },
        })

        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { updatedAt: new Date() },
        })

        const payload = mapMessage(message)

        app.io
          .to(`conversation:${conversation.publicId}`)
          .emit('conversation:message:new', payload)
        app.io
          .to(`organization:${currentUser.organizationId}`)
          .emit('conversation:message:new', payload)

        reply.status(201).send(payload)
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )
}
