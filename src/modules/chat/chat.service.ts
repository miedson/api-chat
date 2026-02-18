import { prisma } from '@/lib/prisma'

export type ChatUser = {
  id: number
  publicId: string
  name: string
  organizationId: number
}

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message)
  }
}

type ListConversationsInput = {
  organizationId: number
  inboxId: number
  userId: number
  status?: 'open' | 'pending' | 'resolved'
  assignee?: 'me' | 'unassigned' | 'all'
  search?: string
  cursor?: number
  limit: number
}

type ListMessagesInput = {
  organizationId: number
  conversationId: number
  cursor?: number
  limit: number
}

const parseSearchConversationId = (search?: string): number | null => {
  if (!search?.trim()) {
    return null
  }

  const value = Number(search.trim())
  if (!Number.isInteger(value) || value <= 0) {
    return null
  }

  return value
}

export class ChatService {
  async getRequestUser(publicId: string): Promise<ChatUser> {
    const user = await prisma.user.findFirst({
      where: { public_id: publicId },
      select: {
        id: true,
        public_id: true,
        name: true,
        organizationId: true,
      },
    })

    if (!user) {
      throw new HttpError(401, 'Unauthorized')
    }

    return {
      id: user.id,
      publicId: user.public_id,
      name: user.name,
      organizationId: user.organizationId,
    }
  }

  assertOrganizationAccess(user: ChatUser, organizationId: number) {
    if (user.organizationId !== organizationId) {
      throw new HttpError(403, 'Forbidden')
    }
  }

  async listInboxes(organizationId: number) {
    return prisma.inbox.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    })
  }

  async createInbox(organizationId: number, name: string) {
    return prisma.inbox.create({
      data: { organizationId, name: name.trim() },
    })
  }

  async createContact(
    organizationId: number,
    input: { name: string; externalId?: string },
  ) {
    return prisma.contact.create({
      data: {
        organizationId,
        name: input.name.trim(),
        externalId: input.externalId?.trim() || null,
      },
    })
  }

  async createConversation(
    organizationId: number,
    actorId: number,
    input: { inboxId: number; contactId: number; content?: string },
  ) {
    const [inbox, contact] = await Promise.all([
      prisma.inbox.findFirst({
        where: { id: input.inboxId, organizationId },
        select: { id: true },
      }),
      prisma.contact.findFirst({
        where: { id: input.contactId, organizationId },
        select: { id: true },
      }),
    ])

    if (!inbox || !contact) {
      throw new HttpError(404, 'Inbox or contact not found')
    }

    const now = new Date()

    return prisma.$transaction(async (transaction) => {
      const conversation = await transaction.conversation.create({
        data: {
          organizationId,
          inboxId: input.inboxId,
          contactId: input.contactId,
          status: 'open',
          lastActivityAt: now,
          lastMessageAt: input.content ? now : null,
        },
        include: {
          contact: true,
          assignee: {
            select: {
              id: true,
              public_id: true,
              name: true,
              email: true,
            },
          },
        },
      })

      let createdMessage: Awaited<ReturnType<typeof transaction.message.create>> | null

      createdMessage = null
      if (input.content) {
        createdMessage = await transaction.message.create({
          data: {
            organizationId,
            conversationId: conversation.id,
            senderType: 'agent',
            senderId: actorId,
            direction: 'outbound',
            content: input.content.trim(),
            createdAt: now,
          },
        })
      }

      return {
        conversation,
        message: createdMessage,
      }
    })
  }

  async listConversations(input: ListConversationsInput) {
    const searchConversationId = parseSearchConversationId(input.search)

    const conversations = await prisma.conversation.findMany({
      where: {
        organizationId: input.organizationId,
        inboxId: input.inboxId,
        ...(input.status ? { status: input.status } : {}),
        ...(input.assignee === 'me'
          ? { assigneeId: input.userId }
          : input.assignee === 'unassigned'
            ? { assigneeId: null }
            : {}),
        ...(input.search?.trim()
          ? {
              OR: [
                { id: searchConversationId ?? -1 },
                {
                  contact: {
                    name: {
                      contains: input.search,
                      mode: 'insensitive',
                    },
                  },
                },
                {
                  contact: {
                    externalId: {
                      contains: input.search,
                      mode: 'insensitive',
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        contact: true,
      },
      orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }],
      take: input.limit,
      ...(input.cursor
        ? {
            cursor: { id: input.cursor },
            skip: 1,
          }
        : {}),
    })

    const conversationIds = conversations.map((conversation) => conversation.id)

    if (conversationIds.length === 0) {
      return {
        items: [],
        nextCursor: null,
      }
    }

    const [lastMessages, reads] = await Promise.all([
      prisma.message.findMany({
        where: {
          organizationId: input.organizationId,
          conversationId: { in: conversationIds },
        },
        orderBy: [{ conversationId: 'asc' }, { createdAt: 'desc' }],
      }),
      prisma.conversationRead.findMany({
        where: {
          userId: input.userId,
          conversationId: { in: conversationIds },
        },
      }),
    ])

    const lastMessageByConversation = new Map<number, (typeof lastMessages)[number]>()
    for (const message of lastMessages) {
      if (!lastMessageByConversation.has(message.conversationId)) {
        lastMessageByConversation.set(message.conversationId, message)
      }
    }

    const readByConversation = new Map(reads.map((read) => [read.conversationId, read]))

    const unreadCountPairs = await Promise.all(
      conversationIds.map(async (conversationId) => {
        const read = readByConversation.get(conversationId)
        const unreadCount = await prisma.message.count({
          where: {
            organizationId: input.organizationId,
            conversationId,
            ...(read
              ? {
                  createdAt: {
                    gt: read.lastSeenAt,
                  },
                }
              : {}),
            NOT: {
              senderType: 'agent',
              senderId: input.userId,
            },
          },
        })

        return [conversationId, unreadCount] as const
      }),
    )

    const unreadByConversation = new Map(unreadCountPairs)

    const items = conversations.map((conversation) => ({
      conversation,
      contact: conversation.contact,
      lastMessage: lastMessageByConversation.get(conversation.id) ?? null,
      unreadCount: unreadByConversation.get(conversation.id) ?? 0,
    }))

    const nextCursor = conversations.length === input.limit ? conversations.at(-1)?.id ?? null : null

    return {
      items,
      nextCursor,
    }
  }

  async getConversationWithMessages(input: ListMessagesInput) {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: input.conversationId,
        organizationId: input.organizationId,
      },
      include: {
        contact: true,
        assignee: {
          select: {
            id: true,
            public_id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    if (!conversation) {
      throw new HttpError(404, 'Conversation not found')
    }

    const messagesDesc = await prisma.message.findMany({
      where: {
        organizationId: input.organizationId,
        conversationId: input.conversationId,
      },
      orderBy: [{ id: 'desc' }],
      take: input.limit,
      ...(input.cursor
        ? {
            cursor: { id: input.cursor },
            skip: 1,
          }
        : {}),
    })

    const messages = [...messagesDesc].reverse()
    const nextCursor = messagesDesc.length === input.limit ? messagesDesc.at(-1)?.id ?? null : null

    return {
      conversation,
      contact: conversation.contact,
      assignee: conversation.assignee
        ? {
            id: conversation.assignee.id,
            publicId: conversation.assignee.public_id,
            name: conversation.assignee.name,
            email: conversation.assignee.email,
          }
        : null,
      messages,
      nextCursor,
    }
  }

  async ensureConversationAccess(organizationId: number, conversationId: number) {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        organizationId,
      },
      include: {
        contact: true,
      },
    })

    if (!conversation) {
      throw new HttpError(404, 'Conversation not found')
    }

    return conversation
  }

  async ensureInboxAccess(organizationId: number, inboxId: number) {
    const inbox = await prisma.inbox.findFirst({
      where: {
        id: inboxId,
        organizationId,
      },
    })

    if (!inbox) {
      throw new HttpError(404, 'Inbox not found')
    }

    return inbox
  }

  async sendAgentMessage(input: {
    organizationId: number
    conversationId: number
    senderId: number
    content: string
  }) {
    const conversation = await this.ensureConversationAccess(
      input.organizationId,
      input.conversationId,
    )

    const now = new Date()

    const [message, updatedConversation] = await prisma.$transaction([
      prisma.message.create({
        data: {
          organizationId: input.organizationId,
          conversationId: input.conversationId,
          senderType: 'agent',
          senderId: input.senderId,
          direction: 'outbound',
          content: input.content.trim(),
          createdAt: now,
        },
      }),
      prisma.conversation.update({
        where: { id: input.conversationId },
        data: {
          lastMessageAt: now,
          lastActivityAt: now,
          updatedAt: now,
        },
      }),
    ])

    return {
      message,
      conversation: updatedConversation,
      inboxId: conversation.inboxId,
      assigneeId: conversation.assigneeId,
    }
  }

  async assignConversation(input: {
    organizationId: number
    conversationId: number
    assigneeId: number
  }) {
    const now = new Date()

    const conversation = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.conversation.findFirst({
        where: {
          id: input.conversationId,
          organizationId: input.organizationId,
        },
      })

      if (!existing) {
        throw new HttpError(404, 'Conversation not found')
      }

      if (existing.assigneeId && existing.assigneeId !== input.assigneeId) {
        throw new HttpError(409, 'Conversation already assigned')
      }

      if (existing.assigneeId === input.assigneeId) {
        return existing
      }

      const result = await transaction.conversation.updateMany({
        where: {
          id: input.conversationId,
          organizationId: input.organizationId,
          assigneeId: null,
        },
        data: {
          assigneeId: input.assigneeId,
          lastActivityAt: now,
          updatedAt: now,
        },
      })

      if (result.count === 0) {
        throw new HttpError(409, 'Conversation already assigned')
      }

      const updated = await transaction.conversation.findUnique({
        where: {
          id: input.conversationId,
        },
      })

      if (!updated) {
        throw new HttpError(404, 'Conversation not found')
      }

      return updated
    })

    return conversation
  }

  async updateConversationStatus(input: {
    organizationId: number
    conversationId: number
    status: 'open' | 'pending' | 'resolved'
  }) {
    await this.ensureConversationAccess(input.organizationId, input.conversationId)

    return prisma.conversation.update({
      where: { id: input.conversationId },
      data: {
        status: input.status,
        lastActivityAt: new Date(),
      },
    })
  }

  async markConversationLastSeen(input: {
    organizationId: number
    conversationId: number
    userId: number
  }) {
    await this.ensureConversationAccess(input.organizationId, input.conversationId)

    const lastMessage = await prisma.message.findFirst({
      where: {
        organizationId: input.organizationId,
        conversationId: input.conversationId,
      },
      orderBy: { id: 'desc' },
    })

    const now = new Date()

    await prisma.conversationRead.upsert({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: input.userId,
        },
      },
      create: {
        conversationId: input.conversationId,
        userId: input.userId,
        lastSeenMessageId: lastMessage?.id ?? null,
        lastSeenAt: now,
      },
      update: {
        lastSeenMessageId: lastMessage?.id ?? null,
        lastSeenAt: now,
      },
    })

    return {
      conversationId: input.conversationId,
      unreadCount: 0,
      lastSeenMessageId: lastMessage?.id ?? null,
      lastSeenAt: now,
    }
  }

  async unreadCountForUser(input: {
    organizationId: number
    conversationId: number
    userId: number
  }) {
    const read = await prisma.conversationRead.findUnique({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: input.userId,
        },
      },
    })

    return prisma.message.count({
      where: {
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        ...(read
          ? {
              createdAt: {
                gt: read.lastSeenAt,
              },
            }
          : {}),
        NOT: {
          senderType: 'agent',
          senderId: input.userId,
        },
      },
    })
  }
}
