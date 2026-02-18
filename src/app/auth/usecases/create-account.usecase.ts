import type { FastifyBaseLogger } from 'fastify/types/logger'
import type { PasswordHasher } from '@/app/common/interfaces/password-hasher'
import type { UseCase } from '@/app/common/interfaces/usecase'
import type { OrganizationRepository } from '@/app/organization/repositories/organization.repository'
import { createOrganizationSchema } from '@/app/organization/schemas/organization.schema'
import type { UserRepository } from '../../users/repositories/user.repository'
import {
  type CreateAccountDto,
  createUserSchema,
} from '../../users/schemas/user.schema'
import type { ChatwootService } from '../../users/services/chatwood.service'

export class CreateAccount implements UseCase<CreateAccountDto, void> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly organizationRepository: OrganizationRepository,
    // private readonly passwordHasher: PasswordHasher,
    // private readonly chatwootService: ChatwootService,
    private readonly logger: FastifyBaseLogger,
  ) {}

  async execute({
    name,
    displayName,
    email,
    password,
    organization,
  }: CreateAccountDto): Promise<void> {
    createOrganizationSchema.parse({ organization })

    this.logger.info(
      `start create user account: ${JSON.stringify({ name, displayName, email, password, organization })}`,
    )

    const userExists = await this.userRepository.findByEmail(email)
    const organizationExists = await this.organizationRepository.findByDocument(
      organization.document,
    )

    if (userExists) {
      throw new Error('email already used')
    }
    if (organizationExists) {
      throw new Error('document alredy used')
    }

    // this.logger.info(`call chatwoot service`)
    // const { accountId, userId, role } =
    //   await this.chatwootService.provisionAccountWithUser(
    //     {
    //       name,
    //       displayName,
    //       email,
    //       password,
    //       organization,
    //     },
    //     'administrator',
    //   )

    // this.logger.info(
    //   `account and user created in chatwoot: ${JSON.stringify({ accountId, userId, role })}`,
    // )

    const organizationCreated = await this.organizationRepository.create({
      ...organization,
      chatwootAccountId: accountId,
    })

    createUserSchema.parse({
      name,
      displayName,
      email,
      password,
      role,
      organizationId: organizationCreated.id,
    })

    // const passwordHash = await this.passwordHasher.hash(password)

    await this.userRepository.create({
      // name,
      // displayName,
      uuid,
      email,
      // password,
      // chatwootUserId: userId,
      role,
      // organization: {
      //   ...organizationCreated,
      //   uuid: organizationCreated.publicId,
      // },
      // passwordHash,
    })

    this.logger.info(`finished create user account`)
  }
}
