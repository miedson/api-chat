import type { UseCase } from '@/app/common/interfaces/usecase'
import type { AuthRequestDto } from '../schemas/auth-request.schema'
import type { AuthResponseDto } from '../schemas/auth-response.schema'
import type { AuthApiService } from '../services/auth-api.service'

export class AuthenticateUser
  implements UseCase<AuthRequestDto, AuthResponseDto>
{
  constructor(private readonly authApiService: AuthApiService) {}

  async execute(input: AuthRequestDto): Promise<AuthResponseDto> {
    const { access_token, refresh_token, expires_in } =
      await this.authApiService.authenticate(input)

    return { access_token, refresh_token, expires_in }
  }
}
