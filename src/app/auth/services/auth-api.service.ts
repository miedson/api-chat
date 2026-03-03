import type { HttpClient } from '@/app/common/interfaces/http-client'

type RegisterDto = {
  name: string
  displayName?: string | null
  email: string
  password: string
  role: 'application' | 'root'
}

type AuthenticateDto = {
  email: string
  password: string
}

type RefreshSessionDto = {
  refreshToken: string
}

type LogoutSessionDto = {
  refreshToken: string
}

type VerifyEmailDto = {
  email: string
  code: string
}

type ForgotPasswordDto = {
  email: string
}

type ResetPasswordDto = {
  token: string
  password: string
}

type GrantApplicationAccessDto = {
  userPublicId: string
  role?: 'user' | 'admin'
}

type AuthResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  user: {
    id: string
    name: string
    displayName: string | null
    email: string
  }
  application: {
    id: string
    name: string
    slug: string
    role: string
  }
}

type RegisterResponse = {
  status: 'created' | 'verification_required'
  message: string
  userPublicId: string
}

export class AuthApiService {
  private readonly apiUrl = process.env.AUTH_API_URL ?? ''
  private readonly applicationSlug = process.env.AUTH_API_APPLICATION_SLUG ?? ''
  private readonly applicationSecret =
    process.env.AUTH_API_APPLICATION_SECRET ?? ''
  private readonly headers = {
    'x-application-slug': this.getApplicationSlug(),
    'x-application-secret': this.getApplicationSecret(),
  }

  constructor(private readonly httpClient: HttpClient) {}

  async register(input: RegisterDto): Promise<RegisterResponse> {
    const { data } = await this.httpClient.post<RegisterResponse>(
      `${this.apiUrl}/api/v1/register`,
      {
        name: input.name,
        displayName: input.displayName,
        email: input.email,
        password: input.password,
        role: input.role,
      },
      {
        headers: this.headers,
      },
    )

    return data
  }

  async authenticate(input: AuthenticateDto): Promise<AuthResponse> {
    const { data } = await this.httpClient.post<AuthResponse>(
      `${this.apiUrl}/api/v1/login`,
      {
        email: input.email,
        password: input.password,
      },
      {
        headers: this.headers,
      },
    )

    return data
  }

  async refreshSession(input: RefreshSessionDto): Promise<AuthResponse> {
    const { data } = await this.httpClient.post<AuthResponse>(
      `${this.apiUrl}/api/v1/refresh-token`,
      {
        refresh_token: input.refreshToken,
      },
      {
        headers: this.headers,
      },
    )

    return data
  }

  async logoutSession(input: LogoutSessionDto): Promise<void> {
    await this.httpClient.post(
      `${this.apiUrl}/api/v1/logout`,
      {
        refresh_token: input.refreshToken,
      },
      {
        headers: this.headers,
      },
    )
  }

  async verifyEmail(input: VerifyEmailDto): Promise<void> {
    await this.httpClient.post(
      `${this.apiUrl}/api/v1/verify-email`,
      {
        email: input.email,
        code: input.code,
      },
      {
        headers: this.headers,
      },
    )
  }

  async forgotPassword(input: ForgotPasswordDto): Promise<void> {
    await this.httpClient.post(
      `${this.apiUrl}/api/v1/forgot-password`,
      {
        email: input.email,
      },
      {
        headers: this.headers,
      },
    )
  }

  async resetPassword(input: ResetPasswordDto): Promise<void> {
    await this.httpClient.post(
      `${this.apiUrl}/api/v1/reset-password`,
      {
        token: input.token,
        password: input.password,
      },
      {
        headers: this.headers,
      },
    )
  }

  async grantApplicationAccess({
    userPublicId,
    role = 'admin',
  }: GrantApplicationAccessDto): Promise<void> {
    const applicationSlug = this.getApplicationSlug()
    const grantPath = `${encodeURIComponent(applicationSlug)}/users/${encodeURIComponent(userPublicId)}`

    await this.httpClient.post(
      `${this.apiUrl}/api/v1/applications/${grantPath}`,
      { role },
      {
        headers: this.headers,
      },
    )
  }

  private getApplicationSlug(): string {
    if (!this.applicationSlug) {
      throw new Error('AUTH_API_APPLICATION_SLUG is required')
    }

    return this.applicationSlug
  }

  private getApplicationSecret(): string {
    if (!this.applicationSecret) {
      throw new Error('AUTH_API_APPLICATION_SECRET is required')
    }

    return this.applicationSecret
  }

}
