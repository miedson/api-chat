import { Repository } from '@/app/common/interfaces/repository'
import type { Prisma, PrismaClient } from '@/generated/prisma/client'
import type { CreateOrganizationDto } from '../schemas/organization.schema'

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
  }: CreateOrganizationDto) {
    return await this.dataSource.organization.create({
      data: {
        name,
        document,
        phone,
        slug: name.toLowerCase().replace(/\s+/g, '-'),
        domain,
        status: status ?? 'active',
        supportEmail,
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
