import type { UseCase } from '@/app/common/interfaces/usecase'
import type { UserRepository } from '@/app/users/repositories/user.repository'
import {
  authRequestSchema,
  type AuthRequestDto,
} from '../schemas/auth-request.schema'
import type { AuthResponseDto } from '../schemas/auth-response.schema'
import type { AuthApiService } from '../services/auth-api.service'

export class AuthenticateUser
  implements UseCase<AuthRequestDto, AuthResponseDto>
{
  constructor(
    private readonly authApiService: AuthApiService,
    private readonly userRepository: UserRepository,
  ) {}

  async execute(input: AuthRequestDto): Promise<AuthResponseDto> {
    const data = authRequestSchema.parse(input)
    const user = await this.userRepository.findByEmail(data.email)
    if (!user) {
      throw new Error('Invalid credentials')
    }
    const { access_token, refresh_token, expires_in } =
      await this.authApiService.authenticate(input)

    return { access_token, refresh_token, expires_in }
  }
}
