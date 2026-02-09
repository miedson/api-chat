import type { UseCase } from '@/app/common/interfaces/usecase'
import type { ChannelProvider } from '../interfaces/channel.provider'
import type { CreateInstanceEvolutionApiResponse } from '../services/evolutionapi-channel.provider'

export class CreateChannel
  implements UseCase<unknown, CreateInstanceEvolutionApiResponse>
{
  constructor(private readonly channelProvider: ChannelProvider) {}

  async execute(input: {
    name: string
    number: number
  }): Promise<CreateInstanceEvolutionApiResponse> {
    return (await this.channelProvider.connect({
      instanceName: input.name,
    })) as CreateInstanceEvolutionApiResponse
  }
}
