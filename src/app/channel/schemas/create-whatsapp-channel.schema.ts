import z from 'zod'
import { phoneSchema } from '@/app/organization/schemas/organization.schema'

export const whatsAppChannelSchema = z.object({
  name: z.string().optional(),
  phone: phoneSchema.optional(),
})

export type whatsAppChannelDto = z.infer<typeof whatsAppChannelSchema>

export const createWhatsAppChannelSchema = whatsAppChannelSchema.extend({
  useOrganizationPhone: z.boolean().default(true),
})

export type CreateWhatsAppChannelDto = z.infer<
  typeof createWhatsAppChannelSchema
>
