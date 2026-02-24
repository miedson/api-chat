import z from 'zod'

export const authResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
})

export type AuthResponseDto = z.infer<typeof authResponseSchema>
