import z from 'zod'
import type { FastifyTypeInstance } from '@/types'
import { FetchHttpClientAdapter } from '../common/adapters/fetch-httpclient.adapter'
import { errorSchema } from '../common/schemas/error.schema'
import { createWhatsAppChannelSchema } from './schemas/create-whatsapp-channel.schema'
import { EvolutionApiChannelProvider } from './services/evolutionapi-channel.provider'
import { CreateWhatsAppChannel } from './usecases/create-whatsapp-channel.usecase'

const httpClient = new FetchHttpClientAdapter()
const channelProvider = new EvolutionApiChannelProvider(httpClient)

export async function channelRoutes(app: FastifyTypeInstance) {
  app.post(
    'whatsapp',
    {
      schema: {
        tags: ['channel'],
        summary: 'Integração com Whatsapp',
        body: createWhatsAppChannelSchema,
        response: {
          201: z
            .object({
              base64: z.string(),
            })
            .describe('Channel created'),
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const createWhatsAppChannel = new CreateWhatsAppChannel(channelProvider)
        const {
          qrcode: { base64 },
        } = await createWhatsAppChannel.execute(request.body)
        reply.status(201).send({ base64 })
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )
}
