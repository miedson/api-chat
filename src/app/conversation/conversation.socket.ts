import { prisma } from '@/lib/prisma'
import type { FastifyTypeInstance } from '@/types'
import { ConversationStatus, MessageType } from '@/generated/prisma/enums'
import { Server } from 'socket.io'
import { validateAccessTokenWithJwks } from '@/app/auth/services/jwks-token-validator.service'

type SocketUser = {
  id: number
  publicId: string
  organizationId: number
  name: string
  displayName: string | null
}

function getCookieValue(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) {
    return null
  }

  const cookies = cookieHeader.split(';')

  for (const cookiePart of cookies) {
    const [cookieName, ...cookieValueParts] = cookiePart.trim().split('=')
    if (cookieName === name) {
      return decodeURIComponent(cookieValueParts.join('='))
    }
  }

  return null
}

export function registerConversationSocket(app: FastifyTypeInstance) {
  const io = new Server(app.server, {
    cors: {
      origin: true,
      credentials: true,
    },
  })

  app.decorate('io', io)

  io.use(async (socket: any, next: (err?: Error) => void) => {
    try {
      const accessToken = getCookieValue(socket.handshake.headers.cookie, 'access_token')

      if (!accessToken) {
        next(new Error('Unauthorized'))
        return
      }

      const decoded = await validateAccessTokenWithJwks(accessToken)

      if (!decoded) {
        next(new Error('Unauthorized'))
        return
      }

      const user = await prisma.user.findFirst({
        where: { public_id: decoded.sub },
        select: {
          id: true,
          public_id: true,
          name: true,
          displayName: true,
          organizationId: true,
        },
      })

      if (!user) {
        next(new Error('Unauthorized'))
        return
      }

      socket.data.user = {
        id: user.id,
        publicId: user.public_id,
        organizationId: user.organizationId,
        name: user.name,
        displayName: user.displayName,
      } satisfies SocketUser

      next()
    } catch {
      next(new Error('Unauthorized'))
    }
  })

  io.on('connection', (socket: any) => {
    const currentUser = socket.data.user as SocketUser

    socket.join(`organization:${currentUser.organizationId}`)

    socket.on('conversation:join', async ({ conversationId }: { conversationId: string }) => {
      const conversation = await prisma.conversation.findFirst({
        where: {
          publicId: conversationId,
          organizationId: currentUser.organizationId,
        },
        select: { publicId: true, assignedToId: true, status: true },
      })

      if (!conversation) {
        socket.emit('conversation:error', { message: 'Conversation not found' })
        return
      }

      if (
        conversation.assignedToId !== currentUser.id ||
        conversation.status === ConversationStatus.open
      ) {
        socket.emit('conversation:error', {
          message: 'Conversation is not assigned to current agent',
        })
        return
      }

      socket.join(`conversation:${conversation.publicId}`)
      socket.emit('conversation:joined', { conversationId: conversation.publicId })
    })

    socket.on('conversation:leave', ({ conversationId }: { conversationId: string }) => {
      socket.leave(`conversation:${conversationId}`)
    })

    socket.on(
      'conversation:message:send',
      async (payload: { conversationId: string; content: string; type?: MessageType }) => {
        const conversation = await prisma.conversation.findFirst({
          where: {
            publicId: payload.conversationId,
            organizationId: currentUser.organizationId,
          },
          select: { id: true, publicId: true, assignedToId: true, status: true },
        })

        if (!conversation) {
          socket.emit('conversation:error', { message: 'Conversation not found' })
          return
        }

        if (
          conversation.assignedToId !== currentUser.id ||
          conversation.status === ConversationStatus.open
        ) {
          socket.emit('conversation:error', {
            message: 'Conversation is not assigned to current agent',
          })
          return
        }

        const message = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            senderId: currentUser.id,
            content: payload.content,
            type: payload.type ?? MessageType.outgoing,
          },
          include: {
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

        io.to(`conversation:${conversation.publicId}`).emit('conversation:message:new', {
          id: message.publicId,
          conversationId: conversation.publicId,
          content: message.content,
          type: message.type,
          createdAt: message.createdAt.toISOString(),
          sender: message.sender
            ? {
                id: message.sender.public_id,
                name: message.sender.name,
                displayName: message.sender.displayName,
              }
            : null,
        })
        io.to(`organization:${currentUser.organizationId}`).emit('conversation:message:new', {
          id: message.publicId,
          conversationId: conversation.publicId,
          content: message.content,
          type: message.type,
          createdAt: message.createdAt.toISOString(),
          sender: message.sender
            ? {
                id: message.sender.public_id,
                name: message.sender.name,
                displayName: message.sender.displayName,
              }
            : null,
        })
      },
    )
  })

  app.addHook('onClose', (_, done) => {
    io.close()
    done()
  })
}
