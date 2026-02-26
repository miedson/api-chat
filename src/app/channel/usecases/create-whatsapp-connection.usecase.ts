import { randomBytes } from 'node:crypto'
import type { UseCase } from '@/app/common/interfaces/usecase'
import type { ChannelProviderType } from '@/generated/prisma/enums'
import type { Prisma } from '@/generated/prisma/client'
import type { ChannelConnectionRepository } from '../repositories/channel-connection.repository'
import type { OrganizationRepository } from '@/app/organization/repositories/organization.repository'
import { getWhatsAppProvider } from '../services/whatsapp-provider.factory'
import type { CreateWhatsAppConnectionDto } from '../schemas/whatsapp-channel.schema'

export type CreateWhatsAppConnectionInput = CreateWhatsAppConnectionDto & {
  userEmail: string
}

export class CreateWhatsAppConnection
  implements UseCase<CreateWhatsAppConnectionInput, unknown>
{
  constructor(
    private readonly channelConnectionRepository: ChannelConnectionRepository,
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: CreateWhatsAppConnectionInput) {
    const organization = await this.organizationRepository.findByUserEmail(
      input.userEmail,
    )

    if (!organization) {
      throw new Error('Organization not found')
    }

    const phone =
      input.useOrganizationPhone || !input.phone ? organization.phone : input.phone

    const connectionName =
      input.name ?? `WhatsApp ${organization.slug} ${new Date().toISOString()}`

    const instanceName =
      input.instanceName ??
      `${organization.slug}_${Date.now()}_${Math.floor(Math.random() * 1e5)}`

    const provider = getWhatsAppProvider(input.provider as ChannelProviderType)

    const webhookSecret = randomBytes(24).toString('hex')

    const connection = await this.channelConnectionRepository.create({
      organizationId: organization.id,
      provider: input.provider as ChannelProviderType,
      name: connectionName,
      phone,
      providerInstanceKey: instanceName,
      webhookSecret,
    })

    const webhookUrl =
      process.env.WHATSAPP_WEBHOOK_PUBLIC_URL ??
      process.env.APP_PUBLIC_URL ??
      undefined

    const normalizedWebhookUrl = webhookUrl
      ? `${webhookUrl.replace(/\/$/, '')}/channel/whatsapp/webhook/evolution?secret=${encodeURIComponent(webhookSecret)}`
      : undefined

    const providerConnection = await provider.connect({
      connectionPublicId: connection.publicId,
      instanceName,
      phone,
      webhookUrl: normalizedWebhookUrl,
      webhookSecret,
    })

    const updatedConnection = await this.channelConnectionRepository.updateById(
      connection.id,
      {
        status: providerConnection.status,
        providerExternalId: providerConnection.providerExternalId,
        providerInstanceKey: providerConnection.providerInstanceKey ?? instanceName,
        qrCodeBase64: providerConnection.qrCodeBase64,
        metadata: providerConnection.metadata as Prisma.InputJsonValue | undefined,
        qrCodeExpiresAt: providerConnection.qrCodeBase64
          ? new Date(Date.now() + 1000 * 60 * 5)
          : null,
      },
    )

    return updatedConnection
  }
}
