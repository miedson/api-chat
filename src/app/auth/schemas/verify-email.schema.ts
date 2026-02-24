import { z } from 'zod'

export const verifyEmailSchema = z.object({
  email: z.email(),
  code: z.string().length(6),
})

export type VerifyEmailDto = z.infer<typeof verifyEmailSchema>

export const verifyEmailAndGrantAccessSchema = verifyEmailSchema.extend({
  userPublicId: z.uuid(),
  role: z.enum(['user', 'admin']).optional(),
  provisioningSecret: z.string().min(1),
})

export type VerifyEmailAndGrantAccessDto = z.infer<
  typeof verifyEmailAndGrantAccessSchema
>
