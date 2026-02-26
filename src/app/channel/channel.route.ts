import { ChannelConnectionRepository } from '@/app/channel/repositories/channel-connection.repository'
import {
  channelConnectionParamsSchema,
  channelConnectionSchema,
  createWhatsAppConnectionResponseSchema,
  createWhatsAppConnectionSchema,
  evolutionWebhookQuerySchema,
} from '@/app/channel/schemas/whatsapp-channel.schema'
import { CreateWhatsAppConnection } from '@/app/channel/usecases/create-whatsapp-connection.usecase'
import { errorSchema } from '@/app/common/schemas/error.schema'
import { mapConversation, mapMessage } from '@/app/conversation/serializers'
import { OrganizationRepository } from '@/app/organization/repositories/organization.repository'
import { ChannelConnectionStatus, ChannelProviderType, MessageType } from '@/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import type { FastifyTypeInstance } from '@/types'
import { getWhatsAppProvider } from './services/whatsapp-provider.factory'
import z from 'zod'

function mapChannelConnection(connection: {
  publicId: string
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
    kind: 'whatsapp' as const,
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
        const channelConnectionRepository = new ChannelConnectionRepository(prisma)

        const organization = await organizationRepository.findByUserEmail(
          request.user.email,
        )

        if (!organization) {
          reply.status(500).send({ message: 'Organization not found' })
          return
        }

        const connections = await channelConnectionRepository.listByOrganizationId(
          organization.id,
        )

        reply.status(200).send(connections.map(mapChannelConnection))
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
        const channelConnectionRepository = new ChannelConnectionRepository(prisma)
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

  app.post(
    '/:connectionId/webhook/sync',
    {
      schema: {
        tags: ['channel'],
        summary: 'Reconfigurar webhook da instancia do canal',
        params: channelConnectionParamsSchema,
        response: {
          200: createWhatsAppConnectionResponseSchema,
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const organizationRepository = new OrganizationRepository(prisma)
        const channelConnectionRepository = new ChannelConnectionRepository(prisma)

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
          reply.status(500).send({ message: 'Channel has no provider instance key' })
          return
        }

        const webhookUrlBase =
          process.env.WHATSAPP_WEBHOOK_PUBLIC_URL ??
          process.env.APP_PUBLIC_URL ??
          undefined

        if (!webhookUrlBase) {
          reply.status(500).send({
            message: 'WHATSAPP_WEBHOOK_PUBLIC_URL or APP_PUBLIC_URL is required',
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
          request.headers['x-webhook-secret']?.toString() ?? request.query.secret
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
                  event.status === ChannelConnectionStatus.connected ? null : undefined,
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
