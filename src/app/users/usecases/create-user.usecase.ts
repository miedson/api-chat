import type { UseCase } from '@/app/common/interfaces/usecase'
import type { OrganizationRepository } from '@/app/organization/repositories/organization.repository'
import type { AuthApiService } from '@/app/auth/services/auth-api.service'
import type { UserRepository } from '../repositories/user.repository'
import { createUserSchema, type CreateUserDto } from '../schemas/user.schema'

export class CreateUser implements UseCase<CreateUserDto, void> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly organizationRepository: OrganizationRepository,
    private readonly authApiService: AuthApiService,
  ) {}
  async execute(input: CreateUserDto): Promise<void> {
    const {
      name,
      displayName,
      email,
      password,
      organizationId,
      role,
    } = createUserSchema.parse(input)

    const userExists = await this.userRepository.findByEmail(input.email)

    if (userExists) {
      throw new Error('email already used')
    }
    const organization =
      await this.organizationRepository.findById(organizationId)

    if (!organization) {
      throw new Error('Organization not found')
    }

    await this.authApiService.register({
      name,
      displayName,
      email,
      password,
      role: 'application',
    })

    await this.userRepository.create({
      name,
      displayName,
      email,
      organizationId,
      role,
    })
  }
}
