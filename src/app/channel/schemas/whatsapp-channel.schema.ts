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

export const channelConnectionSchema = z.object({
  id: z.string(),
  kind: z.literal('whatsapp'),
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

export const evolutionWebhookQuerySchema = z.object({
  secret: z.string().optional(),
})

export const channelConnectionParamsSchema = z.object({
  connectionId: z.string().uuid(),
})
