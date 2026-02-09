import { Repository } from '@/app/common/interfaces/repository'
import type { Prisma, PrismaClient } from '@/generated/prisma/client'
import type { CreateOrganizationDto } from '../schemas/organization.schema'

type CreateOrganizationWithChatwoodIdDto = CreateOrganizationDto & {
  chatwootAccountId: number
}

export class OrganizationRepository extends Repository<
  PrismaClient | Prisma.TransactionClient
> {
  async create({
    name,
    document,
    phone,
    domain,
    status,
    supportEmail,
    chatwootAccountId,
  }: CreateOrganizationWithChatwoodIdDto) {
    return await this.dataSource.organization.create({
      data: {
        name,
        document,
        phone,
        slug: name.toLowerCase().replace(/\s+/g, '-'),
        domain,
        status: status ?? 'active',
        supportEmail,
        chatwootAccountId,
      },
    })
  }

  async findByDocument(document: string) {
    return await this.dataSource.organization.findFirst({
      where: { document },
    })
  }

  async findById(id: number) {
    return await this.dataSource.organization.findFirst({
      where: {
        id,
      },
    })
  }

  async findByUserUUID(uuid: string) {
    return await this.dataSource.organization.findFirst({
      where: {
        users: {
          some: { public_id: uuid },
        },
      },
    })
  }
}
