import type { UseCase } from '../../common/interfaces/usecase'
import type { UserRepository } from '../repositories/user.repository'
import type { UserResponseDto } from '../schemas/user.schema'

export class ListUsers implements UseCase<void, UserResponseDto[]> {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(): Promise<UserResponseDto[]> {
    const users = await this.userRepository.findAll()

    return users.map((user) => {
      const organization = {
        ...user.organization,
        uuid: user.organization.publicId,
      } as Record<string, unknown>

      delete organization.id
      delete organization.publicId

      const response = {
        ...user,
        uuid: user.public_id,
        organization,
      } as Record<string, unknown>

      delete response.id
      delete response.public_id
      delete response.organizationId

      return response as UserResponseDto
    })
  }
}
