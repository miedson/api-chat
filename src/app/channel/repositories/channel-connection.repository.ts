import { Repository } from '@/app/common/interfaces/repository'
import type {
  ChannelKind,
  ChannelConnectionStatus,
  ChannelProviderType,
  Prisma,
  PrismaClient,
} from '@/generated/prisma/client'

export class ChannelConnectionRepository extends Repository<
  PrismaClient | Prisma.TransactionClient
> {
  async create(input: {
    organizationId: number
    kind?: ChannelKind
    provider: ChannelProviderType
    name: string
    phone: string
    providerInstanceKey?: string
    webhookSecret: string
  }) {
    return this.dataSource.channelConnection.create({
      data: {
        organizationId: input.organizationId,
        kind: input.kind,
        provider: input.provider,
        name: input.name,
        phone: input.phone,
        providerInstanceKey: input.providerInstanceKey,
        webhookSecret: input.webhookSecret,
      },
    })
  }

  async listByOrganizationId(organizationId: number) {
    return this.dataSource.channelConnection.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findByPublicIdAndOrganization(input: {
    publicId: string
    organizationId: number
  }) {
    return this.dataSource.channelConnection.findFirst({
      where: {
        publicId: input.publicId,
        organizationId: input.organizationId,
      },
    })
  }

  async findByProviderInstanceKey(input: {
    provider: ChannelProviderType
    instanceKey: string
  }) {
    return this.dataSource.channelConnection.findFirst({
      where: {
        provider: input.provider,
        providerInstanceKey: input.instanceKey,
      },
    })
  }

  async updateById(
    id: number,
    data: Prisma.ChannelConnectionUpdateInput,
  ) {
    return this.dataSource.channelConnection.update({
      where: { id },
      data,
    })
  }

  async setStatus(id: number, status: ChannelConnectionStatus) {
    return this.dataSource.channelConnection.update({
      where: { id },
      data: { status },
    })
  }
}
