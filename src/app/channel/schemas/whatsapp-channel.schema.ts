import { ChannelConnectionStatus, ChannelProviderType } from '@/generated/prisma/enums'
import { phoneSchema } from '@/app/organization/schemas/organization.schema'
import { z } from 'zod'

export const createWhatsAppConnectionSchema = z.object({
  provider: z.enum(ChannelProviderType).default(ChannelProviderType.evolution),
  name: z.string().min(2).max(80).optional(),
  instanceName: z.string().min(3).max(100).optional(),
  phone: phoneSchema.optional(),
  useOrganizationPhone: z.boolean().default(true),
})

export type CreateWhatsAppConnectionDto = z.infer<
  typeof createWhatsAppConnectionSchema
>

export const createInstagramConnectionSchema = z.object({
  provider: z
    .literal(ChannelProviderType.instagram_graph)
    .default(ChannelProviderType.instagram_graph),
  name: z.string().min(2).max(80).optional(),
  instagramAccountId: z.string().min(2).max(120),
  pageId: z.string().min(2).max(120),
  accessToken: z.string().min(10).max(2000),
  webhookVerifyToken: z.string().min(3).max(200).optional(),
})

export type CreateInstagramConnectionDto = z.infer<
  typeof createInstagramConnectionSchema
>

export const channelConnectionSchema = z.object({
  id: z.string(),
  kind: z.enum(['whatsapp', 'instagram']),
  provider: z.enum(ChannelProviderType),
  name: z.string(),
  phone: z.string(),
  status: z.enum(ChannelConnectionStatus),
  providerInstanceKey: z.string().nullable(),
  qrCodeBase64: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const createWhatsAppConnectionResponseSchema = z.object({
  connection: channelConnectionSchema,
})

export const createInstagramConnectionResponseSchema = z.object({
  connection: channelConnectionSchema,
})

export const evolutionWebhookQuerySchema = z.object({
  secret: z.string().optional(),
})

export const channelConnectionParamsSchema = z.object({
  connectionId: z.string().uuid(),
})

export const instagramOauthUrlResponseSchema = z.object({
  authUrl: z.string().url(),
})

export const instagramOauthExchangeQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
})
