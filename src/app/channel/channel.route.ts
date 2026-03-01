import { ChannelConnectionRepository } from '@/app/channel/repositories/channel-connection.repository'
import {
  channelConnectionParamsSchema,
  channelConnectionSchema,
  createInstagramConnectionResponseSchema,
  createInstagramConnectionSchema,
  instagramOauthExchangeQuerySchema,
  instagramOauthUrlResponseSchema,
  createWhatsAppConnectionResponseSchema,
  createWhatsAppConnectionSchema,
  evolutionWebhookQuerySchema,
} from '@/app/channel/schemas/whatsapp-channel.schema'
import { CreateInstagramConnection } from '@/app/channel/usecases/create-instagram-connection.usecase'
import { CreateWhatsAppConnection } from '@/app/channel/usecases/create-whatsapp-connection.usecase'
import { errorSchema } from '@/app/common/schemas/error.schema'
import { mapConversation, mapMessage } from '@/app/conversation/serializers'
import { OrganizationRepository } from '@/app/organization/repositories/organization.repository'
import {
  ChannelConnectionStatus,
  ChannelKind,
  ChannelProviderType,
  MessageType,
} from '@/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import type { FastifyTypeInstance } from '@/types'
import { getWhatsAppProvider } from './services/whatsapp-provider.factory'
import { getInstagramProvider } from './services/instagram-provider.factory'
import z from 'zod'
import { randomBytes } from 'node:crypto'

function mapChannelConnection(connection: {
  publicId: string
  kind: ChannelKind
  provider: ChannelProviderType
  name: string
  phone: string
  status: ChannelConnectionStatus
  providerInstanceKey: string | null
  qrCodeBase64: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: connection.publicId,
    kind: connection.kind,
    provider: connection.provider,
    name: connection.name,
    phone: connection.phone,
    status: connection.status,
    providerInstanceKey: connection.providerInstanceKey,
    qrCodeBase64: connection.qrCodeBase64,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  }
}

function emitChannelConnectionUpdated(
  app: FastifyTypeInstance,
  organizationId: number,
  connection: ReturnType<typeof mapChannelConnection>,
) {
  app.io
    .to(`organization:${organizationId}`)
    .emit('channel:connection:updated', connection)
}

function extractInstagramDirectEvents(payload: any) {
  const events: Array<{
    pageId: string
    senderId: string
    senderName?: string
    text: string
    externalMessageId?: string
    happenedAt: Date
  }> = []

  const entries = Array.isArray(payload?.entry) ? payload.entry : []
  for (const entry of entries) {
    const entryId = String(entry?.id ?? '')
    const messaging = Array.isArray(entry?.messaging) ? entry.messaging : []
    for (const item of messaging) {
      const fromId = String(item?.sender?.id ?? '')
      const recipientId = String(item?.recipient?.id ?? '')
      const isEcho = Boolean(item?.message?.is_echo)
      const text = item?.message?.text
      if (
        !fromId ||
        isEcho ||
        typeof text !== 'string' ||
        !text.trim()
      ) {
        continue
      }

      const timestamp = Number(item?.timestamp ?? Date.now())
      events.push({
        pageId:
          entryId && entryId !== '0'
            ? entryId
            : recipientId,
        senderId: fromId,
        senderName: undefined,
        text: text.trim(),
        externalMessageId: item?.message?.mid,
        happenedAt: new Date(timestamp > 1e12 ? timestamp : timestamp * 1000),
      })
    }

    const changes = Array.isArray(entry?.changes) ? entry.changes : []
    for (const change of changes) {
      if (String(change?.field ?? '') !== 'messages') {
        continue
      }

      const value = change?.value
      const fromId = String(value?.sender?.id ?? '')
      const recipientId = String(value?.recipient?.id ?? '')
      const isEcho = Boolean(value?.message?.is_echo)
      const text = value?.message?.text
      if (!fromId || isEcho || typeof text !== 'string' || !text.trim()) {
        continue
      }

      const timestamp = Number(value?.timestamp ?? entry?.time ?? Date.now())
      events.push({
        pageId:
          entryId && entryId !== '0'
            ? entryId
            : recipientId,
        senderId: fromId,
        senderName: undefined,
        text: text.trim(),
        externalMessageId: value?.message?.mid,
        happenedAt: new Date(timestamp > 1e12 ? timestamp : timestamp * 1000),
      })
    }
  }

  return events
}

function extractInstagramCommentEvents(payload: any) {
  const events: Array<{
    pageId: string
    commentId: string
    commenterId: string
    commenterName?: string
    text: string
    happenedAt: Date
  }> = []

  const entries = Array.isArray(payload?.entry) ? payload.entry : []
  for (const entry of entries) {
    const entryId = String(entry?.id ?? '')
    const changes = Array.isArray(entry?.changes) ? entry.changes : []
    for (const change of changes) {
      const value = change?.value
      const field = String(change?.field ?? '')
      const item = String(value?.item ?? '')
      const verb = String(value?.verb ?? '')
      const text = value?.message ?? value?.text
      const fromId = String(value?.from?.id ?? value?.from_id ?? '')
      const commentId = String(value?.comment_id ?? value?.id ?? '')
      const pageId =
        entryId && entryId !== '0'
          ? entryId
          : String(value?.recipient?.id ?? '')
      const isFeedComment =
        field === 'feed' && item === 'comment' && ['add', 'edited'].includes(verb)
      const isInstagramCommentField = field === 'comments'

      if (
        !isFeedComment &&
        !isInstagramCommentField
      ) {
        continue
      }

      if (
        !commentId ||
        !fromId ||
        typeof text !== 'string' ||
        !text.trim()
      ) {
        continue
      }

      if (fromId === pageId) {
        continue
      }

      const timestamp = Number(value?.created_time ?? Date.now())
      events.push({
        pageId,
        commentId,
        commenterId: fromId,
        commenterName: value?.from?.name ?? value?.from?.username ?? undefined,
        text: text.trim(),
        happenedAt: new Date(timestamp > 1e12 ? timestamp : timestamp * 1000),
      })
    }
  }

  return events
}

async function fetchJsonOrThrow<T>(url: string): Promise<T> {
  const response = await fetch(url)
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: { message?: string } })
    | null

  if (!response.ok || !payload) {
    throw new Error(
      `Meta API request failed: HTTP ${response.status} - ${
        payload && typeof payload === 'object' && 'error' in payload
          ? payload.error?.message
          : 'invalid response'
      }`,
    )
  }

  return payload as T
}

export async function channelRoutes(app: FastifyTypeInstance) {
  app.get(
    '',
    {
      schema: {
        tags: ['channel'],
        summary: 'Listar conexoes de canais da organizacao',
        response: {
          200: channelConnectionSchema.array(),
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const organizationRepository = new OrganizationRepository(prisma)
        const channelConnectionRepository = new ChannelConnectionRepository(
          prisma,
        )

        const organization = await organizationRepository.findByUserEmail(
          request.user.email,
        )

        if (!organization) {
          reply.status(500).send({ message: 'Organization not found' })
          return
        }

        const connections =
          await channelConnectionRepository.listByOrganizationId(
            organization.id,
          )

        reply.status(200).send(connections.map(mapChannelConnection))
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )

  app.get(
    '/instagram/oauth/url',
    {
      schema: {
        tags: ['channel'],
        summary: 'Gerar URL OAuth para conectar Instagram',
        response: {
          200: instagramOauthUrlResponseSchema,
          500: errorSchema,
        },
      },
    },
    async (_, reply) => {
      try {
        const appId = process.env.META_APP_ID
        const redirectUri = process.env.INSTAGRAM_OAUTH_REDIRECT_URI

        if (!appId || !redirectUri) {
          throw new Error(
            'META_APP_ID and INSTAGRAM_OAUTH_REDIRECT_URI are required',
          )
        }

        const scopes = [
          'pages_show_list',
          'pages_read_engagement',
          'pages_manage_metadata',
          'instagram_basic',
          'instagram_manage_comments',
          'instagram_manage_messages',
          'business_management',
        ].join(',')

        const state = randomBytes(24).toString('hex')
        const isProduction = process.env.NODE_ENV === 'production'
        const authUrl = `https://www.facebook.com/v23.0/dialog/oauth?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(scopes)}&response_type=code`

        reply
          .setCookie('instagram_oauth_state', state, {
            path: '/',
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax',
            maxAge: 60 * 10,
          })
          .status(200)
          .send({ authUrl })
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )

  app.get(
    '/instagram/oauth/exchange',
    {
      schema: {
        tags: ['channel'],
        summary: 'Trocar código OAuth e conectar canal Instagram',
        querystring: instagramOauthExchangeQuerySchema,
        response: {
          201: createInstagramConnectionResponseSchema,
          400: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const appId = process.env.META_APP_ID
        const appSecret = process.env.META_APP_SECRET
        const redirectUri = process.env.INSTAGRAM_OAUTH_REDIRECT_URI
        const graphBaseUrl =
          process.env.META_GRAPH_API_URL ?? 'https://graph.facebook.com/v23.0'

        if (!appId || !appSecret || !redirectUri) {
          throw new Error(
            'META_APP_ID, META_APP_SECRET and INSTAGRAM_OAUTH_REDIRECT_URI are required',
          )
        }

        const expectedState = request.cookies.instagram_oauth_state
        if (!expectedState || expectedState !== request.query.state) {
          reply.status(400).send({ message: 'Invalid OAuth state' })
          return
        }

        const userTokenResponse = await fetchJsonOrThrow<{
          access_token: string
        }>(
          `${graphBaseUrl.replace(/\/$/, '')}/oauth/access_token?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(request.query.code)}`,
        )

        let userAccessToken = userTokenResponse.access_token

        try {
          const longLived = await fetchJsonOrThrow<{ access_token: string }>(
            `${graphBaseUrl.replace(/\/$/, '')}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(userAccessToken)}`,
          )
          if (longLived.access_token) {
            userAccessToken = longLived.access_token
          }
        } catch {
          // Fallback para token padrão caso extensão falhe.
        }

        const pages = await fetchJsonOrThrow<{
          data: Array<{ id: string; name: string; access_token: string }>
        }>(
          `${graphBaseUrl.replace(/\/$/, '')}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(userAccessToken)}`,
        )

        if (!pages.data?.length) {
          reply.status(400).send({
            message:
              'Nenhuma página do Facebook foi autorizada. Verifique se você selecionou a página vinculada ao Instagram durante o login.',
          })
          return
        }

        let selected: {
          pageId: string
          pageName: string
          pageAccessToken: string
          instagramAccountId: string
        } | null = null

        for (const page of pages.data ?? []) {
          const pageData = await fetchJsonOrThrow<{
            instagram_business_account?: { id?: string }
            connected_instagram_account?: { id?: string }
          }>(
            `${graphBaseUrl.replace(/\/$/, '')}/${encodeURIComponent(page.id)}?fields=instagram_business_account{id,username},connected_instagram_account{id,username}&access_token=${encodeURIComponent(page.access_token)}`,
          )

          const instagramAccountId =
            pageData.instagram_business_account?.id ??
            pageData.connected_instagram_account?.id
          if (!instagramAccountId) {
            continue
          }

          selected = {
            pageId: page.id,
            pageName: page.name,
            pageAccessToken: page.access_token,
            instagramAccountId,
          }
          break
        }

        if (!selected) {
          reply.status(400).send({
            message:
              'Nenhuma página com Instagram Business vinculada foi encontrada nesta autorização.',
          })
          return
        }

        const organizationRepository = new OrganizationRepository(prisma)
        const channelConnectionRepository = new ChannelConnectionRepository(
          prisma,
        )
        const createInstagramConnection = new CreateInstagramConnection(
          channelConnectionRepository,
          organizationRepository,
        )

        const connection = await createInstagramConnection.execute({
          provider: ChannelProviderType.instagram_graph,
          name: `Instagram ${selected.pageName}`,
          instagramAccountId: selected.instagramAccountId,
          pageId: selected.pageId,
          accessToken: selected.pageAccessToken,
          webhookVerifyToken: process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
          userEmail: request.user.email,
        })

        const organization = await organizationRepository.findByUserEmail(
          request.user.email,
        )
        if (organization) {
          emitChannelConnectionUpdated(
            app,
            organization.id,
            mapChannelConnection(connection),
          )
        }

        const isProduction = process.env.NODE_ENV === 'production'
        reply
          .clearCookie('instagram_oauth_state', {
            path: '/',
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax',
          })
          .status(201)
          .send({ connection: mapChannelConnection(connection) })
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )

  app.post(
    '/whatsapp/connect',
    {
      schema: {
        tags: ['channel'],
        summary: 'Conectar canal WhatsApp (Evolution ou Cloud API)',
        body: createWhatsAppConnectionSchema,
        response: {
          201: createWhatsAppConnectionResponseSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const organizationRepository = new OrganizationRepository(prisma)
        const channelConnectionRepository = new ChannelConnectionRepository(
          prisma,
        )
        const createWhatsAppConnection = new CreateWhatsAppConnection(
          channelConnectionRepository,
          organizationRepository,
        )

        const connection = await createWhatsAppConnection.execute({
          ...request.body,
          userEmail: request.user.email,
        })

        const organization = await organizationRepository.findByUserEmail(
          request.user.email,
        )
        if (organization) {
          emitChannelConnectionUpdated(
            app,
            organization.id,
            mapChannelConnection(connection),
          )
        }

        reply.status(201).send({
          connection: mapChannelConnection(connection),
        })
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )

  app.get(
    '/instagram/webhook',
    {
      config: { public: true },
      schema: {
        tags: ['channel'],
        summary: 'Verificação do webhook do Instagram',
        response: {
          200: z.string(),
          403: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const mode = String((request.query as any)['hub.mode'] ?? '')
      const token = String((request.query as any)['hub.verify_token'] ?? '')
      const challenge = String((request.query as any)['hub.challenge'] ?? '')

      if (mode !== 'subscribe' || !token || !challenge) {
        reply.status(403).send({ message: 'Forbidden' })
        return
      }

      const connection = await prisma.channelConnection.findFirst({
        where: {
          provider: ChannelProviderType.instagram_graph,
          metadata: {
            path: ['webhookVerifyToken'],
            equals: token,
          },
        },
        select: { id: true },
      })

      const globalToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN
      if (!connection && (!globalToken || globalToken !== token)) {
        reply.status(403).send({ message: 'Forbidden' })
        return
      }

      reply.status(200).send(challenge)
    },
  )

  app.post(
    '/instagram/webhook',
    {
      config: { public: true },
      schema: {
        tags: ['channel'],
        summary: 'Webhook do Instagram (direct e comentários)',
        response: {
          204: z.undefined(),
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const resolveInstagramConnection = async (webhookOwnerId: string) => {
          if (webhookOwnerId && webhookOwnerId !== '0') {
            const byId = await prisma.channelConnection.findFirst({
              where: {
                provider: ChannelProviderType.instagram_graph,
                OR: [
                  { providerInstanceKey: webhookOwnerId },
                  { providerExternalId: webhookOwnerId },
                  {
                    metadata: {
                      path: ['instagramAccountId'],
                      equals: webhookOwnerId,
                    },
                  },
                  {
                    metadata: {
                      path: ['pageId'],
                      equals: webhookOwnerId,
                    },
                  },
                ],
              },
            })

            if (byId) {
              return byId
            }
          }

          const fallbackConnections = await prisma.channelConnection.findMany({
            where: { provider: ChannelProviderType.instagram_graph },
            take: 2,
            orderBy: { createdAt: 'desc' },
          })

          if (fallbackConnections.length === 1) {
            return fallbackConnections[0]
          }

          return null
        }

        const directEvents = extractInstagramDirectEvents(request.body)
        const commentEvents = extractInstagramCommentEvents(request.body)

        for (const event of directEvents) {
          const connection = await resolveInstagramConnection(event.pageId)

          if (!connection) {
            continue
          }

          let conversation = await prisma.conversation.findFirst({
            where: {
              organizationId: connection.organizationId,
              channelConnectionId: connection.id,
              channel: 'instagram_direct',
              externalContactId: event.senderId,
            },
            include: {
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
                orderBy: { createdAt: 'desc' },
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
            },
          })

          if (!conversation) {
            conversation = await prisma.conversation.create({
              data: {
                organizationId: connection.organizationId,
                channelConnectionId: connection.id,
                channel: 'instagram_direct',
                subject: `Instagram Direct - ${event.senderName ?? event.senderId}`,
                externalContactId: event.senderId,
                externalContactName: event.senderName,
                externalThreadId: event.senderId,
              },
              include: {
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
                  orderBy: { createdAt: 'desc' },
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
              },
            })
            app.io
              .to(`organization:${connection.organizationId}`)
              .emit('conversation:new', mapConversation(conversation))
          }

          const message = await prisma.message.create({
            data: {
              conversationId: conversation.id,
              content: event.text,
              type: MessageType.incoming,
              externalMessageId: event.externalMessageId,
              externalAuthor: event.senderName,
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
            data: { updatedAt: event.happenedAt },
          })

          const mappedMessage = mapMessage(message)
          app.io
            .to(`organization:${connection.organizationId}`)
            .emit('conversation:message:new', mappedMessage)
          app.io
            .to(`conversation:${conversation.publicId}`)
            .emit('conversation:message:new', mappedMessage)
        }

        for (const event of commentEvents) {
          const connection = await resolveInstagramConnection(event.pageId)

          if (!connection) {
            continue
          }

          let conversation = await prisma.conversation.findFirst({
            where: {
              organizationId: connection.organizationId,
              channelConnectionId: connection.id,
              channel: 'instagram_comment',
              externalThreadId: event.commentId,
            },
            include: {
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
                orderBy: { createdAt: 'desc' },
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
            },
          })

          if (!conversation) {
            conversation = await prisma.conversation.create({
              data: {
                organizationId: connection.organizationId,
                channelConnectionId: connection.id,
                channel: 'instagram_comment',
                subject: `Comentario Instagram - ${event.commenterName ?? event.commenterId}`,
                externalContactId: event.commenterId,
                externalContactName: event.commenterName,
                externalThreadId: event.commentId,
              },
              include: {
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
                  orderBy: { createdAt: 'desc' },
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
              },
            })
            app.io
              .to(`organization:${connection.organizationId}`)
              .emit('conversation:new', mapConversation(conversation))
          }

          const message = await prisma.message.create({
            data: {
              conversationId: conversation.id,
              content: event.text,
              type: MessageType.incoming,
              externalMessageId: event.commentId,
              externalAuthor: event.commenterName,
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
            data: { updatedAt: event.happenedAt },
          })

          const mappedMessage = mapMessage(message)
          app.io
            .to(`organization:${connection.organizationId}`)
            .emit('conversation:message:new', mappedMessage)
          app.io
            .to(`conversation:${conversation.publicId}`)
            .emit('conversation:message:new', mappedMessage)
        }

        reply.code(204).send()
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )

  app.post(
    '/instagram/connect',
    {
      schema: {
        tags: ['channel'],
        summary: 'Conectar canal Instagram (Graph API)',
        body: createInstagramConnectionSchema,
        response: {
          201: createInstagramConnectionResponseSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const organizationRepository = new OrganizationRepository(prisma)
        const channelConnectionRepository = new ChannelConnectionRepository(
          prisma,
        )
        const createInstagramConnection = new CreateInstagramConnection(
          channelConnectionRepository,
          organizationRepository,
        )

        const connection = await createInstagramConnection.execute({
          ...request.body,
          userEmail: request.user.email,
        })

        const organization = await organizationRepository.findByUserEmail(
          request.user.email,
        )
        if (organization) {
          emitChannelConnectionUpdated(
            app,
            organization.id,
            mapChannelConnection(connection),
          )
        }

        reply.status(201).send({
          connection: mapChannelConnection(connection),
        })
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )

  app.post(
    '/:connectionId/webhook/sync',
    {
      schema: {
        tags: ['channel'],
        summary: 'Reconfigurar webhook da instancia do canal',
        params: channelConnectionParamsSchema,
        response: {
          200: createWhatsAppConnectionResponseSchema,
          400: errorSchema,
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const organizationRepository = new OrganizationRepository(prisma)
        const channelConnectionRepository = new ChannelConnectionRepository(
          prisma,
        )

        const organization = await organizationRepository.findByUserEmail(
          request.user.email,
        )
        if (!organization) {
          reply.status(500).send({ message: 'Organization not found' })
          return
        }

        const connection =
          await channelConnectionRepository.findByPublicIdAndOrganization({
            publicId: request.params.connectionId,
            organizationId: organization.id,
          })

        if (!connection) {
          reply.status(404).send({ message: 'Channel connection not found' })
          return
        }

        if (!connection.providerInstanceKey) {
          reply
            .status(500)
            .send({ message: 'Channel has no provider instance key' })
          return
        }

        if (connection.kind !== ChannelKind.whatsapp) {
          reply.status(400).send({
            message: 'Webhook sync is only supported for WhatsApp channels',
          })
          return
        }

        const webhookUrlBase =
          process.env.WHATSAPP_WEBHOOK_PUBLIC_URL ??
          process.env.APP_PUBLIC_URL ??
          undefined

        if (!webhookUrlBase) {
          reply.status(500).send({
            message:
              'WHATSAPP_WEBHOOK_PUBLIC_URL or APP_PUBLIC_URL is required',
          })
          return
        }

        const webhookUrl = `${webhookUrlBase.replace(/\/$/, '')}/channel/whatsapp/webhook/evolution?secret=${encodeURIComponent(connection.webhookSecret)}`

        const provider = getWhatsAppProvider(connection.provider)
        await provider.syncWebhook({
          instanceKey: connection.providerInstanceKey,
          webhookUrl,
          webhookSecret: connection.webhookSecret,
        })

        const updatedConnection = await channelConnectionRepository.updateById(
          connection.id,
          { status: ChannelConnectionStatus.pending_qr },
        )

        const mappedConnection = mapChannelConnection(updatedConnection)
        emitChannelConnectionUpdated(app, organization.id, mappedConnection)

        reply.status(200).send({ connection: mappedConnection })
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )

  app.post(
    '/whatsapp/webhook/evolution',
    {
      config: { public: true },
      schema: {
        tags: ['channel'],
        summary: 'Webhook da Evolution API para mensagens/estado',
        querystring: evolutionWebhookQuerySchema,
        response: {
          204: z.undefined(),
          401: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const provider = getWhatsAppProvider(ChannelProviderType.evolution)
        const events = provider.parseWebhook(request.body)

        if (events.length === 0) {
          reply.code(204).send()
          return
        }

        const providedSecret =
          request.headers['x-webhook-secret']?.toString() ??
          request.query.secret
        const globalWebhookSecret = process.env.EVO_WEBHOOK_SECRET

        for (const event of events) {
          const connection = await prisma.channelConnection.findFirst({
            where: {
              provider: ChannelProviderType.evolution,
              providerInstanceKey: event.instanceKey,
            },
          })

          if (!connection) {
            continue
          }

          const perConnectionSecretMatch =
            !!providedSecret && providedSecret === connection.webhookSecret
          const globalSecretMatch =
            !!globalWebhookSecret && providedSecret === globalWebhookSecret

          if (!perConnectionSecretMatch && !globalSecretMatch) {
            reply.status(401).send({ message: 'Unauthorized webhook' })
            return
          }

          if (event.kind === 'connection_status') {
            const updatedConnection = await prisma.channelConnection.update({
              where: { id: connection.id },
              data: {
                status: event.status,
                qrCodeBase64:
                  event.status === ChannelConnectionStatus.connected
                    ? null
                    : undefined,
              },
            })
            emitChannelConnectionUpdated(
              app,
              connection.organizationId,
              mapChannelConnection(updatedConnection),
            )
            continue
          }

          if (event.kind === 'qr_code') {
            const updatedConnection = await prisma.channelConnection.update({
              where: { id: connection.id },
              data: {
                status: ChannelConnectionStatus.pending_qr,
                qrCodeBase64: event.qrCodeBase64,
                qrCodeExpiresAt: new Date(Date.now() + 1000 * 60 * 5),
              },
            })
            emitChannelConnectionUpdated(
              app,
              connection.organizationId,
              mapChannelConnection(updatedConnection),
            )
            continue
          }

          const organizationUsers = await prisma.user.findMany({
            where: { organizationId: connection.organizationId },
            select: { id: true },
          })
          const participantData = organizationUsers.map((user) => ({
            userId: user.id,
          }))

          let conversation = await prisma.conversation.findFirst({
            where: {
              organizationId: connection.organizationId,
              channelConnectionId: connection.id,
              externalContactId: event.externalContactId,
            },
            include: {
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
                orderBy: { createdAt: 'desc' },
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
            },
          })

          if (!conversation) {
            conversation = await prisma.conversation.create({
              data: {
                organizationId: connection.organizationId,
                channel: 'whatsapp',
                subject: event.externalContactName ?? event.externalContactId,
                externalContactId: event.externalContactId,
                externalContactName: event.externalContactName,
                channelConnectionId: connection.id,
                ...(participantData.length > 0
                  ? {
                      participants: {
                        createMany: {
                          data: participantData,
                        },
                      },
                    }
                  : {}),
              },
              include: {
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
                  orderBy: { createdAt: 'desc' },
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
              },
            })

            app.io
              .to(`organization:${connection.organizationId}`)
              .emit('conversation:new', mapConversation(conversation))
          }

          const message = await prisma.message.create({
            data: {
              conversationId: conversation.id,
              content: event.text,
              type: MessageType.incoming,
              externalMessageId: event.externalMessageId,
              externalAuthor: event.externalContactName,
            },
            include: {
              conversation: {
                select: {
                  publicId: true,
                },
              },
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
            data: {
              updatedAt: event.happenedAt,
              externalContactName:
                event.externalContactName ?? conversation.externalContactName,
            },
          })

          const mappedMessage = mapMessage(message)

          app.io
            .to(`organization:${connection.organizationId}`)
            .emit('conversation:message:new', mappedMessage)

          app.io
            .to(`conversation:${conversation.publicId}`)
            .emit('conversation:message:new', mappedMessage)
        }

        reply.code(204).send()
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )
}
