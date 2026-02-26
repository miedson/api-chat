import fCookie from '@fastify/cookie'
import fastifyCors from '@fastify/cors'
import fjtw from '@fastify/jwt'
import fastifySwagger from '@fastify/swagger'
import ScalarApiReference from '@scalar/fastify-api-reference'
import 'dotenv/config'
import { fastify } from 'fastify'
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { validateAuthenticateDecorate } from './app/auth/decorates/validate-authenticate.decorate'
import { errorHandler } from './app/common/error-handler'
import { registerConversationSocket } from './app/conversation/conversation.socket'
import { routes } from './routes'

const app = fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport:
      process.env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              translateTime: 'SYS:standard',
              colorize: true,
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  },
}).withTypeProvider<ZodTypeProvider>()

app.setValidatorCompiler(validatorCompiler)
app.setSerializerCompiler(serializerCompiler)

app.register(fastifyCors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
})

app.register(fjtw, {
  secret: process.env.JWT_SECRET || 'default-jwt-secret',
})

app.addHook('preHandler', (req, _, next) => {
  req.jwt = app.jwt
  return next()
})

app.register(fCookie, {
  secret: process.env.COOKIE_SECRET || 'default-cookie-secret',
  hook: 'preHandler',
})

app.register(fastifySwagger, {
  openapi: {
    info: {
      title: 'IA API CORE',
      description: 'API documentation for my IA core service',
      version: '1.0.0',
    },
  },
  transform: jsonSchemaTransform,
})

app.register(ScalarApiReference, {
  routePrefix: '/docs',
  hooks: {
    onRequest: (request, _, done) => {
      if (process.env?.NODE_ENV === 'development') {
        request.routeOptions.config.public = true
      }
      done()
    },
  },
})

app.addHook('preHandler', validateAuthenticateDecorate)
registerConversationSocket(app)

for (const route of routes) {
  app.register(route.routes, { prefix: route.prefix })
}

app.setErrorHandler(errorHandler)

app
  .listen({
    port: Number(process.env.APP_PORT) || 3000,
    host: '0.0.0.0',
  })
  .then(() => {
    console.log(
      `Server is running on http://${process.env.APP_HOST}:${process.env.APP_PORT}`,
    )
    console.log(
      `Swagger docs available at http://${process.env.APP_HOST}:${process.env.APP_PORT}/docs`,
    )
  })

export default app
