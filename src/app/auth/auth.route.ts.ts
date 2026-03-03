import { authRequestSchema } from '@/app/auth/schemas/auth-request.schema'
import { authResponseSchema } from '@/app/auth/schemas/auth-response.schema'
import {
  verifyEmailAndGrantAccessSchema,
  verifyEmailSchema,
} from '@/app/auth/schemas/verify-email.schema'
import { registerResponseSchema } from '@/app/auth/schemas/register-response.schema'
import { refreshSessionResponseSchema } from '@/app/auth/schemas/refresh-session.schema'
import { errorSchema } from '@/app/common/schemas/error.schema'
import { UserRepository } from '@/app/users/repositories/user.repository'
import { prisma } from '@/lib/prisma'
import type { FastifyTypeInstance } from '@/types'
import { z } from 'zod'
import { FetchHttpClientAdapter } from '../common/adapters/fetch-httpclient.adapter'
import { OrganizationRepository } from '../organization/repositories/organization.repository'
import { createAccountSchema } from '../users/schemas/user.schema'
import { AuthenticateUser } from './usecases/authenticate-user.usecase'
import { CreateAccount } from './usecases/create-account.usecase'
import { AuthApiService } from './services/auth-api.service'

const fetchHttpClientAdapter = new FetchHttpClientAdapter()
const authApiService = new AuthApiService(fetchHttpClientAdapter)
const resendVerificationSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})
const forgotPasswordSchema = z.object({
  email: z.email(),
})
const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8),
})

function buildAuthCookieOptions(maxAgeSeconds: number) {
  const isProduction = process.env.NODE_ENV === 'production'

  return {
    path: '/',
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    maxAge: maxAgeSeconds,
  }
}

export async function authRoutes(app: FastifyTypeInstance) {
  app.post(
    '/register',
    {
      config: { public: true },
      schema: {
        tags: ['auth'],
        summary: 'Criar conta',
        body: createAccountSchema,
        response: {
          201: registerResponseSchema,
          202: registerResponseSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const data = request.body
        const result = await prisma.$transaction(async (transaction) => {
          const userRepository = new UserRepository(transaction)
          const organizationRepository = new OrganizationRepository(transaction)
          const createAccount = new CreateAccount(
            userRepository,
            organizationRepository,
            authApiService,
          )

          return await createAccount.execute({
            ...data,
            organization: {
              ...data.organization,
              domain: data.organization.domain ?? process.env.DOMAIN,
              supportEmail:
                data.organization.supportEmail ??
                process.env.SUPPORT_EMAIL_DEFAULT,
            },
          })
        })

        if (result.status === 'verification_required') {
          reply.status(202).send(result)
          return
        }

        reply.status(201).send(result)
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )

  app.post(
    '/login',
    {
      config: { public: true },
      schema: {
        tags: ['auth'],
        summary: 'Autenticar usuário',
        body: authRequestSchema,
        response: {
          201: authResponseSchema.describe('Authenticated successfully'),
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const userRepository = new UserRepository(prisma)
        const authenticateUser = new AuthenticateUser(
          authApiService,
          userRepository,
        )
        const result = await authenticateUser.execute(request.body)
        const refreshTokenMaxAgeSeconds = Number(
          process.env.REFRESH_TOKEN_MAX_AGE_SECONDS ?? 60 * 60 * 24 * 30,
        )

        reply
          .setCookie(
            'access_token',
            result.access_token,
            buildAuthCookieOptions(result.expires_in),
          )
          .setCookie(
            'refresh_token',
            result.refresh_token,
            buildAuthCookieOptions(refreshTokenMaxAgeSeconds),
          )
          .code(201)
          .send(result)
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )

  app.post(
    '/refresh',
    {
      config: { public: true },
      schema: {
        tags: ['auth'],
        summary: 'Renovar sessão com refresh token',
        response: {
          201: refreshSessionResponseSchema.describe('Session refreshed'),
          401: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const refreshToken = request.cookies.refresh_token

        if (!refreshToken) {
          reply.status(401).send({ message: 'Unauthorized' })
          return
        }

        const result = await authApiService.refreshSession({ refreshToken })
        const refreshTokenMaxAgeSeconds = Number(
          process.env.REFRESH_TOKEN_MAX_AGE_SECONDS ?? 60 * 60 * 24 * 30,
        )

        reply
          .setCookie(
            'access_token',
            result.access_token,
            buildAuthCookieOptions(result.expires_in),
          )
          .setCookie(
            'refresh_token',
            result.refresh_token,
            buildAuthCookieOptions(refreshTokenMaxAgeSeconds),
          )
          .code(201)
          .send(result)
      } catch (error) {
        reply.status(401).send({ message: 'Unauthorized' })
      }
    },
  )

  app.post(
    '/logout',
    {
      config: { public: true },
      schema: {
        tags: ['auth'],
        summary: 'Encerrar sessão',
        response: {
          204: z.undefined(),
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const refreshToken = request.cookies.refresh_token

        if (refreshToken) {
          await authApiService.logoutSession({ refreshToken })
        }

        const isProduction = process.env.NODE_ENV === 'production'
        reply
          .clearCookie('access_token', {
            path: '/',
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax',
          })
          .clearCookie('refresh_token', {
            path: '/',
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax',
          })
          .code(204)
          .send()
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )

  app.post(
    '/verify-email',
    {
      config: { public: true },
      schema: {
        tags: ['auth'],
        summary: 'Verificar e-mail na API Auth',
        body: verifyEmailSchema,
        response: {
          204: z.undefined(),
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        await authApiService.verifyEmail(request.body)
        reply.code(204).send()
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )

  app.post(
    '/forgot-password',
    {
      config: { public: true },
      schema: {
        tags: ['auth'],
        summary: 'Solicitar redefinicao de senha',
        body: forgotPasswordSchema,
        response: {
          204: z.undefined(),
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        await authApiService.forgotPassword(request.body)
        reply.code(204).send()
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )

  app.post(
    '/reset-password',
    {
      config: { public: true },
      schema: {
        tags: ['auth'],
        summary: 'Redefinir senha',
        body: resetPasswordSchema,
        response: {
          204: z.undefined(),
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        await authApiService.resetPassword(request.body)
        reply.code(204).send()
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )

  app.post(
    '/resend-verification',
    {
      config: { public: true },
      schema: {
        tags: ['auth'],
        summary: 'Reenviar codigo de verificacao por e-mail',
        body: resendVerificationSchema,
        response: {
          200: registerResponseSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const userRepository = new UserRepository(prisma)
        const user = await userRepository.findByEmail(request.body.email)

        if (!user) {
          reply.status(500).send({ message: 'User not found' })
          return
        }

        const result = await authApiService.register({
          name: user.name,
          displayName: user.displayName,
          email: user.email,
          password: request.body.password,
          role: 'application',
        })

        reply.status(200).send(result)
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )

  app.post(
    '/verify-email-and-grant-access',
    {
      config: { public: true },
      schema: {
        tags: ['auth'],
        summary: 'Verificar e-mail e conceder acesso da aplicação na API Auth',
        body: verifyEmailAndGrantAccessSchema,
        response: {
          204: z.undefined(),
          401: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const provisioningSecret = process.env.AUTH_API_PROVISIONING_SECRET

        if (!provisioningSecret) {
          throw new Error('AUTH_API_PROVISIONING_SECRET is required')
        }

        if (request.body.provisioningSecret !== provisioningSecret) {
          reply.status(401).send({ message: 'Unauthorized' })
          return
        }

        await authApiService.verifyEmail(request.body)
        await authApiService.grantApplicationAccess({
          userPublicId: request.body.userPublicId,
          role: request.body.role,
        })

        reply.code(204).send()
      } catch (error) {
        reply.status(500).send({ message: (error as Error).message })
      }
    },
  )
}
