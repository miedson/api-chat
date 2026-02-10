import type { UseCase } from '@/app/common/interfaces/usecase'
import type { OrganizationRepository } from '@/app/organization/repositories/organization.repository'
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
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(
    input: CreateWhatsAppChannelDto,
  ): Promise<CreateInstanceEvolutionApiResponse> {
    const data = createWhatsAppChannelSchema.parse(input)

    const organization = await this.organizationRepository.findByUserUUID(
      input.userUUID,
    )
    if (!organization) {
      throw new Error('organization nor found')
    }

    const instanceName =
      data.name ??
      `${organization.slug}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`

    const phone =
      data.useOrganizationPhone || !data.phone ? organization.phone : data.phone

    return await this.channelProvider.connect({
      instanceName,
      number: phone,
    })
  }
}
