import type { FastifyTypeInstance } from '@/types'
import { Server, type Socket } from 'socket.io'
import { z } from 'zod'
import { ChatService, HttpError } from './chat.service'

const joinInboxSchema = z.object({
  inboxId: z.coerce.number().int().positive(),
})

const joinConversationSchema = z.object({
  conversationId: z.coerce.number().int().positive(),
})

const typingSchema = z.object({
  conversationId: z.coerce.number().int().positive(),
})

const messageSendSchema = z.object({
  conversationId: z.coerce.number().int().positive(),
  content: z.string().trim().min(1).max(4000),
})

const statusUpdateSchema = z.object({
  conversationId: z.coerce.number().int().positive(),
  status: z.enum(['open', 'pending', 'resolved']),
})

type SocketAuthUser = {
  id: number
  publicId: string
  organizationId: number
  name: string
}

type SocketRateState = {
  count: number
  startedAt: number
}

class InMemoryPresence {
  private readonly counts = new Map<number, number>()

  onConnect(userId: number) {
    const prev = this.counts.get(userId) ?? 0
    const next = prev + 1
    this.counts.set(userId, next)
    return prev === 0
  }

  onDisconnect(userId: number) {
    const prev = this.counts.get(userId) ?? 0
    const next = Math.max(0, prev - 1)

    if (next === 0) {
      this.counts.delete(userId)
      return true
    }

    this.counts.set(userId, next)
    return false
  }
}

class RedisPresence {
  constructor(private readonly client: any) {}

  private key(userId: number, organizationId: number) {
    return `chat:presence:${organizationId}:${userId}:count`
  }

  async onConnect(userId: number, organizationId: number) {
    const key = this.key(userId, organizationId)
    const count = await this.client.incr(key)
    await this.client.expire(key, 60)
    return count === 1
  }

  async heartbeat(userId: number, organizationId: number) {
    const key = this.key(userId, organizationId)
    await this.client.expire(key, 60)
  }

  async onDisconnect(userId: number, organizationId: number) {
    const key = this.key(userId, organizationId)
    const count = await this.client.decr(key)

    if (count <= 0) {
      await this.client.del(key)
      return true
    }

    return false
  }
}

const parseCookies = (cookieHeader?: string): Record<string, string> => {
  if (!cookieHeader) {
    return {}
  }

  const pairs = cookieHeader.split(';')
  const cookies: Record<string, string> = {}

  for (const pair of pairs) {
    const [rawName, ...rest] = pair.split('=')
    const name = rawName?.trim()

    if (!name || rest.length === 0) {
      continue
    }

    cookies[name] = decodeURIComponent(rest.join('=').trim())
  }

  return cookies
}

const asHttpError = (error: unknown) => {
  if (error instanceof HttpError) {
    return error
  }

  if (error instanceof Error) {
    return new HttpError(500, error.message)
  }

  return new HttpError(500, 'Unexpected error')
}

const createSocketErrorPayload = (error: unknown) => {
  const known = asHttpError(error)

  return {
    code: known.statusCode,
    message: known.message,
  }
}

type RedisAdapterDeps = {
  pubClient: any
  subClient: any
  createAdapter: (pub: any, sub: any) => (nsp: any) => any
}

const loadRedisAdapterDeps = (): RedisAdapterDeps | null => {
  if (!process.env.REDIS_URL) {
    return null
  }

  try {
    const redisModule = require('redis')
    const adapterModule = require('@socket.io/redis-adapter')
    return {
      pubClient: redisModule.createClient({ url: process.env.REDIS_URL }),
      subClient: redisModule.createClient({ url: process.env.REDIS_URL }),
      createAdapter: adapterModule.createAdapter,
    }
  } catch {
    return null
  }
}

const createRateLimiter = () => {
  const windowMs = 10_000
  const maxEvents = 20
  const states = new Map<number, SocketRateState>()

  return {
    hit(userId: number) {
      const now = Date.now()
      const existing = states.get(userId)

      if (!existing || now - existing.startedAt > windowMs) {
        states.set(userId, { count: 1, startedAt: now })
        return true
      }

      if (existing.count >= maxEvents) {
        return false
      }

      existing.count += 1
      states.set(userId, existing)
      return true
    },
  }
}

export const initChatSocket = async (
  app: FastifyTypeInstance,
  chatService: ChatService,
) => {
  const io = new Server(app.server, {
    path: '/socket.io',
    cors: {
      origin: true,
      credentials: true,
    },
  })

  const redisDeps = loadRedisAdapterDeps()
  if (redisDeps) {
    try {
      await Promise.all([redisDeps.pubClient.connect(), redisDeps.subClient.connect()])
      io.adapter(redisDeps.createAdapter(redisDeps.pubClient, redisDeps.subClient))
      app.log.info('Socket.IO Redis adapter enabled')
    } catch (error) {
      app.log.warn({ err: error }, 'Could not enable Redis adapter, using local adapter')
    }
  }

  const localPresence = new InMemoryPresence()
  const redisPresence = redisDeps ? new RedisPresence(redisDeps.pubClient) : null
  const rateLimiter = createRateLimiter()

  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie
      const cookies = parseCookies(cookieHeader)
      const token = cookies.access_token

      if (!token) {
        return next(new Error('Unauthorized'))
      }

      const decoded = app.jwt.verify<{ sub: string }>(token)
      const user = await chatService.getRequestUser(decoded.sub)

      socket.data.user = {
        id: user.id,
        publicId: user.publicId,
        organizationId: user.organizationId,
        name: user.name,
      } satisfies SocketAuthUser

      return next()
    } catch {
      return next(new Error('Unauthorized'))
    }
  })

  const ensureSocketUser = (socket: Socket): SocketAuthUser => {
    const user = socket.data.user as SocketAuthUser | undefined
    if (!user) {
      throw new HttpError(401, 'Unauthorized')
    }
    return user
  }

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

  io.on('connection', (socket) => {
    const user = ensureSocketUser(socket)
    const orgRoom = `org:${user.organizationId}`
    const userRoom = `user:${user.id}`

    socket.join(orgRoom)
    socket.join(userRoom)

    Promise.resolve(
      redisPresence
        ? redisPresence.onConnect(user.id, user.organizationId)
        : localPresence.onConnect(user.id),
    )
      .then((firstConnection) => {
        if (firstConnection) {
          io.to(orgRoom).emit('presence:updated', {
            userId: user.id,
            online: true,
            at: new Date().toISOString(),
          })
        }
      })
      .catch((error) => {
        app.log.warn({ err: error, userId: user.id }, 'Could not update presence on connect')
      })

    const heartbeatInterval = setInterval(() => {
      if (!redisPresence) {
        return
      }

      redisPresence
        .heartbeat(user.id, user.organizationId)
        .catch((error) => app.log.warn({ err: error, userId: user.id }, 'Could not heartbeat presence'))
    }, 20_000)

    socket.on('join:inbox', async (rawPayload, callback) => {
      try {
        const payload = joinInboxSchema.parse(rawPayload)
        await chatService.ensureInboxAccess(user.organizationId, payload.inboxId)
        socket.join(`inbox:${payload.inboxId}`)
        callback?.({ ok: true })
      } catch (error) {
        callback?.({ ok: false, error: createSocketErrorPayload(error) })
      }
    })

    socket.on('leave:inbox', (rawPayload, callback) => {
      try {
        const payload = joinInboxSchema.parse(rawPayload)
        socket.leave(`inbox:${payload.inboxId}`)
        callback?.({ ok: true })
      } catch (error) {
        callback?.({ ok: false, error: createSocketErrorPayload(error) })
      }
    })

    socket.on('join:conversation', async (rawPayload, callback) => {
      try {
        const payload = joinConversationSchema.parse(rawPayload)
        await chatService.ensureConversationAccess(
          user.organizationId,
          payload.conversationId,
        )
        socket.join(`conv:${payload.conversationId}`)
        callback?.({ ok: true })
      } catch (error) {
        callback?.({ ok: false, error: createSocketErrorPayload(error) })
      }
    })

    socket.on('leave:conversation', (rawPayload, callback) => {
      try {
        const payload = joinConversationSchema.parse(rawPayload)
        socket.leave(`conv:${payload.conversationId}`)
        callback?.({ ok: true })
      } catch (error) {
        callback?.({ ok: false, error: createSocketErrorPayload(error) })
      }
    })

    socket.on('typing:start', async (rawPayload, callback) => {
      try {
        const payload = typingSchema.parse(rawPayload)
        await chatService.ensureConversationAccess(
          user.organizationId,
          payload.conversationId,
        )

        socket.to(`conv:${payload.conversationId}`).emit('typing:updated', {
          conversationId: payload.conversationId,
          userId: user.id,
          typing: true,
        })

        callback?.({ ok: true })
      } catch (error) {
        callback?.({ ok: false, error: createSocketErrorPayload(error) })
      }
    })

    socket.on('typing:stop', async (rawPayload, callback) => {
      try {
        const payload = typingSchema.parse(rawPayload)
        await chatService.ensureConversationAccess(
          user.organizationId,
          payload.conversationId,
        )

        socket.to(`conv:${payload.conversationId}`).emit('typing:updated', {
          conversationId: payload.conversationId,
          userId: user.id,
          typing: false,
        })

        callback?.({ ok: true })
      } catch (error) {
        callback?.({ ok: false, error: createSocketErrorPayload(error) })
      }
    })

    socket.on('message:send', async (rawPayload, callback) => {
      try {
        if (!rateLimiter.hit(user.id)) {
          throw new HttpError(429, 'Too many messages, slow down')
        }

        const payload = messageSendSchema.parse(rawPayload)
        const result = await chatService.sendAgentMessage({
          organizationId: user.organizationId,
          conversationId: payload.conversationId,
          senderId: user.id,
          content: payload.content,
        })

        io.to(`conv:${payload.conversationId}`).emit('message:created', result.message)
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

        callback?.({ ok: true, message: result.message })
      } catch (error) {
        callback?.({ ok: false, error: createSocketErrorPayload(error) })
      }
    })

    socket.on('conversation:assign', async (rawPayload, callback) => {
      try {
        const payload = joinConversationSchema.parse(rawPayload)
        const conversation = await chatService.assignConversation({
          organizationId: user.organizationId,
          conversationId: payload.conversationId,
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

        callback?.({ ok: true, conversation })
      } catch (error) {
        callback?.({ ok: false, error: createSocketErrorPayload(error) })
      }
    })

    socket.on('conversation:status', async (rawPayload, callback) => {
      try {
        const payload = statusUpdateSchema.parse(rawPayload)
        const conversation = await chatService.updateConversationStatus({
          organizationId: user.organizationId,
          conversationId: payload.conversationId,
          status: payload.status,
        })

        emitConversationUpdated({
          conversationId: conversation.id,
          organizationId: conversation.organizationId,
          inboxId: conversation.inboxId,
          assigneeId: conversation.assigneeId,
          status: conversation.status,
          lastActivityAt: conversation.lastActivityAt,
        })

        callback?.({ ok: true, conversation })
      } catch (error) {
        callback?.({ ok: false, error: createSocketErrorPayload(error) })
      }
    })

    socket.on('conversation:last_seen', async (rawPayload, callback) => {
      try {
        const payload = joinConversationSchema.parse(rawPayload)
        const read = await chatService.markConversationLastSeen({
          organizationId: user.organizationId,
          conversationId: payload.conversationId,
          userId: user.id,
        })

        io.to(userRoom).emit('unread:updated', {
          conversationId: payload.conversationId,
          unreadCount: read.unreadCount,
        })

        callback?.({ ok: true, data: read })
      } catch (error) {
        callback?.({ ok: false, error: createSocketErrorPayload(error) })
      }
    })

    socket.on('disconnect', () => {
      clearInterval(heartbeatInterval)
      Promise.resolve(
        redisPresence
          ? redisPresence.onDisconnect(user.id, user.organizationId)
          : localPresence.onDisconnect(user.id),
      )
        .then((disconnected) => {
          if (disconnected) {
            io.to(orgRoom).emit('presence:updated', {
              userId: user.id,
              online: false,
              at: new Date().toISOString(),
            })
          }
        })
        .catch((error) => {
          app.log.warn({ err: error, userId: user.id }, 'Could not update presence on disconnect')
        })
    })
  })

  app.addHook('onClose', async () => {
    await io.close()

    if (redisDeps) {
      await Promise.allSettled([redisDeps.pubClient.quit(), redisDeps.subClient.quit()])
    }
  })

  return io
}
