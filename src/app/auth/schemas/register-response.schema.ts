import { z } from 'zod'

export const registerResponseSchema = z.object({
  status: z.enum(['created', 'verification_required']),
  message: z.string(),
})

export type RegisterResponseDto = z.infer<typeof registerResponseSchema>
