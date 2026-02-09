import type { UseCase } from '@/app/common/interfaces/usecase'
import type { ChannelProvider } from '../interfaces/channel.provider'
import {
  type CreateWhatsAppChannelDto,
  createWhatsAppChannelSchema,
} from '../schemas/create-whatsapp-channel.schema'
import type {
  CreateInstanceEvolutionApiRequest,
  CreateInstanceEvolutionApiResponse,
} from '../services/evolutionapi-channel.provider'

export class CreateWhatsAppChannel
  implements
    UseCase<CreateWhatsAppChannelDto, CreateInstanceEvolutionApiResponse>
{
  constructor(
    private readonly channelProvider: ChannelProvider<
      CreateInstanceEvolutionApiRequest,
      CreateInstanceEvolutionApiResponse
    >,
  ) {}

  async execute(
    input: CreateWhatsAppChannelDto,
  ): Promise<CreateInstanceEvolutionApiResponse> {
    const data = createWhatsAppChannelSchema.parse(input)
    return await this.channelProvider.connect({
      instanceName: data.name,
      number: data.number,
    })
  }
}
