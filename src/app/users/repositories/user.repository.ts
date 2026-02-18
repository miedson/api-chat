import { Repository } from '@/app/common/interfaces/repository'
import type {
  Prisma,
  PrismaClient,
  Roles,
  User,
} from '@/generated/prisma/client'
import type { CreateUserDto, UserDto } from '../schemas/user.schema'

// type CreateUserWithChatWootUserId = UserDto & {
//   chatwootUserId: number
//   role: Roles
// }

type UserWithOrganization = Prisma.UserGetPayload<{
  include: { organization: true }
}>

export class UserRepository extends Repository<
  PrismaClient | Prisma.TransactionClient
> {
  async create({
    // name,
    // displayName,
    // uuid,
    email,
    // passwordHash,
    // organization: { id: organizationId },
    // chatwootUserId,
    role,
    organizationId,
  }: CreateUserDto) {
    const user = await this.dataSource.user.create({
      data: {
        // name,
        // displayName,
        email,
        // passwordHash,
        organizationId,
        // chatwootUserId,
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

  // async updatePasswordHash(
  //   tokenHashId: string,
  //   userId: number,
  //   passwordUserHash: string,
  // ): Promise<void> {
  //   this.dataSource.user.update({
  //     where: { id: userId },
  //     data: {
  //       passwordHash: passwordUserHash,
  //     },
  //   })
  //   this.dataSource.passwordResetToken.update({
  //     where: { id: tokenHashId },
  //     data: { useAt: new Date() },
  //   })
  // }
}
