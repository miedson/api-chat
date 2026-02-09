import z, { base64 } from 'zod'
import type { FastifyTypeInstance } from '@/types'
import { CreateChannel } from './usecases/create-channel.usecase'
import { EvolutionApiChannelProvider } from './services/evolutionapi-channel.provider'
import { FetchHttpClientAdapter } from '../common/adapters/fetch-httpclient.adapter'
import { errorSchema } from '../common/schemas/error.schema'

const httpClient = new FetchHttpClientAdapter()
const channelProvider = new EvolutionApiChannelProvider(httpClient)

export async function channelRoutes(app: FastifyTypeInstance) {
  app.post(
    'whatsapp',
    {
      schema: {
        tags: ['channel'],
        summary: 'Integração com Whatsapp',
        body: z.object({
          name: z.string(),
          number: z.number(),
        }),
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
        const createChannel = new CreateChannel(channelProvider)
        const {
          qrcode: { base64 },
        } = await createChannel.execute(request.body)
        reply.status(201).send({ base64 })
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )
}
