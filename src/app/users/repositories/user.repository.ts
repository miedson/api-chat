import { Repository } from '@/app/common/interfaces/repository'
import type {
  Prisma,
  PrismaClient,
  Roles,
  User,
} from '@/generated/prisma/client'

type CreateUserDto = {
  name: string
  displayName?: string | null
  email: string
  organizationId: number
  role: Roles
}

type UserWithOrganization = Prisma.UserGetPayload<{
  include: { organization: true }
}>

export class UserRepository extends Repository<
  PrismaClient | Prisma.TransactionClient
> {
  async create({
    name,
    displayName,
    email,
    organizationId,
    role,
  }: CreateUserDto) {
    const user = await this.dataSource.user.create({
      data: {
        name,
        displayName,
        email,
        organizationId,
        role,
      },
    })

    return user
  }

  async findByEmail(email: string): Promise<UserWithOrganization | null> {
    const user = await this.dataSource.user.findUnique({
      where: { email },
      include: { organization: true },
    })

    if (!user) {
      return null
    }

    return user
  }

  async findAll(): Promise<UserWithOrganization[]> {
    return await this.dataSource.user.findMany({
      include: { organization: true },
    })
  }

  async findByUUID(uuid: string): Promise<User | null> {
    return await this.dataSource.user.findFirst({
      where: { public_id: uuid },
    })
  }
}
