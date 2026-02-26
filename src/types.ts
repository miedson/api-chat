import { JWT } from '@fastify/jwt'
import {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from 'fastify'
import { ZodTypeProvider } from 'fastify-type-provider-zod'
import type { Server as SocketIOServer } from 'socket.io'

export type FastifyTypeInstance = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  ZodTypeProvider
>

declare module 'fastify' {
  export interface FastifyRequest {
    jwt: JWT
  }

  export interface FastifyInstance {
    io: SocketIOServer
  }

  export interface FastifyContextConfig {
    public?: boolean
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: UserPayload
  }
}

export type UserPayload = {
  sub: string
  email: string
  name: string
}
