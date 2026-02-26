import type { FastifyReply, FastifyRequest } from 'fastify'
import { validateAccessTokenWithJwks } from '@/app/auth/services/jwks-token-validator.service'

export const validateAuthenticateDecorate = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const isPublic = request.routeOptions.config?.public
  if (isPublic) return

  const token = request.cookies.access_token

  if (!token) {
    reply.status(401).send({ message: 'Unauthorized' })
    return
  }

  const decoded = await validateAccessTokenWithJwks(token)
  if (!decoded) {
    reply.status(401).send({ message: 'Unauthorized' })
    return
  }

  request.user = decoded
}
