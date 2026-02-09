import z from 'zod'

export const createWhatsAppChannelSchema = z.object({
  name: z.string(),
  number: z.number(),
})

export type CreateWhatsAppChannelDto = z.infer<
  typeof createWhatsAppChannelSchema
>
