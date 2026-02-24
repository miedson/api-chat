import type { UseCase } from '@/app/common/interfaces/usecase'
import type { OrganizationRepository } from '@/app/organization/repositories/organization.repository'
import type { UserRepository } from '../../users/repositories/user.repository'
import { type CreateAccountDto } from '../../users/schemas/user.schema'
import { createOrganizationSchema } from '@/app/organization/schemas/organization.schema'
import type { AuthApiService } from '../services/auth-api.service'
import type { RegisterResponseDto } from '../schemas/register-response.schema'

export class CreateAccount implements UseCase<CreateAccountDto, RegisterResponseDto> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly organizationRepository: OrganizationRepository,
    private readonly authApiService: AuthApiService,
  ) {}

  async execute({
    name,
    displayName,
    email,
    password,
    organization,
  }: CreateAccountDto): Promise<RegisterResponseDto> {
    createOrganizationSchema.parse({ organization })

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

    const registerResponse = await this.authApiService.register({
      name,
      displayName,
      email,
      password,
      role: 'application',
    })

    const organizationCreated =
      await this.organizationRepository.create(organization)

    await this.userRepository.create({
      name,
      displayName,
      email,
      role: 'administrator',
      organizationId: organizationCreated.id,
    })

    return registerResponse
  }
}
