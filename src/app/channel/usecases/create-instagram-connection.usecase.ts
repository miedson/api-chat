import { randomBytes } from 'node:crypto'
import type { UseCase } from '@/app/common/interfaces/usecase'
import type { ChannelProviderType } from '@/generated/prisma/enums'
import type { Prisma } from '@/generated/prisma/client'
import type { OrganizationRepository } from '@/app/organization/repositories/organization.repository'
import type { ChannelConnectionRepository } from '../repositories/channel-connection.repository'
import { getInstagramProvider } from '../services/instagram-provider.factory'
import type { CreateInstagramConnectionDto } from '../schemas/whatsapp-channel.schema'

export type CreateInstagramConnectionInput = CreateInstagramConnectionDto & {
  userEmail: string
}

export class CreateInstagramConnection
  implements UseCase<CreateInstagramConnectionInput, unknown>
{
  constructor(
    private readonly channelConnectionRepository: ChannelConnectionRepository,
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: CreateInstagramConnectionInput) {
    const organization = await this.organizationRepository.findByUserEmail(
      input.userEmail,
    )

    if (!organization) {
      throw new Error('Organization not found')
    }

    const connectionName =
      input.name ?? `Instagram ${organization.slug} ${new Date().toISOString()}`

    const provider = getInstagramProvider(input.provider as ChannelProviderType)
    const existingConnection =
      await this.channelConnectionRepository.findByProviderInstanceKey({
        provider: input.provider as ChannelProviderType,
        instanceKey: input.pageId,
      })

    if (
      existingConnection &&
      existingConnection.organizationId !== organization.id
    ) {
      throw new Error(
        'Esta pagina do Instagram ja esta conectada em outra organizacao.',
      )
    }

    const connection = existingConnection
      ? await this.channelConnectionRepository.updateById(existingConnection.id, {
          kind: 'instagram',
          name: connectionName,
          phone: input.instagramAccountId,
        })
      : await this.channelConnectionRepository.create({
          organizationId: organization.id,
          kind: 'instagram',
          provider: input.provider as ChannelProviderType,
          name: connectionName,
          phone: input.instagramAccountId,
          providerInstanceKey: input.pageId,
          webhookSecret: randomBytes(24).toString('hex'),
        })

    const providerConnection = await provider.connect({
      connectionPublicId: connection.publicId,
      instagramAccountId: input.instagramAccountId,
      pageId: input.pageId,
      accessToken: input.accessToken,
      webhookVerifyToken: input.webhookVerifyToken,
    })

    const updatedConnection = await this.channelConnectionRepository.updateById(
      connection.id,
      {
        status: providerConnection.status,
        providerExternalId: providerConnection.providerExternalId,
        providerInstanceKey: providerConnection.providerInstanceKey ?? input.pageId,
        metadata: providerConnection.metadata as Prisma.InputJsonValue | undefined,
      },
    )

    return updatedConnection
  }
}
