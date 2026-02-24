import type { HttpClient } from '@pp/common/interfaces/http-client'

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

type VerifyEmailDto = {
  email: string
  code: string
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

  async grantApplicationAccess({
    userPublicId,
    role = 'admin',
  }: GrantApplicationAccessDto): Promise<void> {
    const rootAccessToken = await this.getRootAccessToken()
    const applicationSlug = this.getApplicationSlug()
    const grantPath = `${encodeURIComponent(applicationSlug)}/users/${encodeURIComponent(userPublicId)}`

    await this.httpClient.post(
      `${this.apiUrl}/api/v1/admin/applications/${grantPath}`,
      { role },
      {
        headers: {
          Cookie: `access_token=${rootAccessToken}`,
        },
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

  private async getRootAccessToken(): Promise<string> {
    const rootEmail = process.env.AUTH_API_ROOT_EMAIL
    const rootPassword = process.env.AUTH_API_ROOT_PASSWORD

    if (!rootEmail || !rootPassword) {
      throw new Error(
        'AUTH_API_ROOT_EMAIL and AUTH_API_ROOT_PASSWORD are required',
      )
    }

    const { data } = await this.httpClient.post<AuthResponse>(
      `${this.apiUrl}/api/v1/login`,
      {
        email: rootEmail,
        password: rootPassword,
      },
    )

    return data.access_token
  }
}
