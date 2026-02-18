import type { HttpClient } from '@/app/common/interfaces/http-client'
import type { CreateUserDto } from '@/app/users/schemas/user.schema'

type AuthenticateResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  user: {
    id: string
    name: string
    displayName: string
    email: string
  }
  application: {
    id: string
    name: string
    slug: string
    role: string
  }
}

export class ApiAuthService {
  private apiUrl = process.env.AUTH_API_URL ?? ''
  private headers = {
    'x-application-slug': `${process.env.AUTH_API_APP_SLUG}`,
    'x-application-secret': `${process.env.AUTH_API_APP_SECRET}`,
  }

  constructor(private readonly httpClient: HttpClient) {}

  async register({name, displayName, email, password}: CreateUserDto): Promise<void> {
    await this.httpClient.post(`${this.apiUrl}/api/v1/register`, {
      name,
      displayName,
      email,
      password,
      role: 'application'
    }, {
      headers: this.headers,
    })
  }

  async authenticate(
    email: string,
    password: string,
  ): Promise<AuthenticateResponse> {
    const response = await this.httpClient.post<AuthenticateResponse>(
      `${this.apiUrl}/api/v1/login`,
      { email, password },
      {
        headers: this.headers,
      },
    )
    return response.data
  }
}
