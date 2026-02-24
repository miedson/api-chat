import { z } from 'zod'
import {
  createOrganizationSchema,
  organizationSchema,
} from '@/app/organization/schemas/organization.schema'
import { Roles } from '@/generated/prisma/enums'

export const passwordSchema = z
  .string()
  .min(8, { error: 'Senha deve ter no mínimo 8 caracteres' })
  .max(128, { error: 'Senha deve ter no máximo 128 caracteres' })
  .regex(/[a-z]/, { error: 'Precisa de letra minúscula' })
  .regex(/[A-Z]/, { error: 'Precisa de letra maiúscula' })
  .regex(/[0-9]/, { error: 'Precisa de número' })
  .regex(/[^A-Za-z0-9]/, { error: 'Precisa de símbolo' })

export const userSchema = z.object({
  name: z.string().min(1).max(120),
  displayName: z.string().min(1).max(50).optional().nullable(),
  email: z.email().max(254),
  password: passwordSchema,
  organization: organizationSchema,
  role: z.enum(Roles),
})

export type UserDto = z.infer<typeof userSchema>

export const createAccountSchema = userSchema
  .omit({
    role: true,
  })
  .pick({
    name: true,
    displayName: true,
    email: true,
    password: true,
  })
  .extend({
    organization: createOrganizationSchema,
  })

export type CreateAccountDto = z.infer<typeof createAccountSchema>

export const createUserSchema = userSchema
  .pick({
    name: true,
    displayName: true,
    email: true,
    password: true,
    role: true,
  })
  .extend({
    organizationId: z.number(),
  })

export type CreateUserDto = z.infer<typeof createUserSchema>

export const userResponseSchema = userSchema
  .omit({
    password: true,
    organization: true,
  })
  .extend({
    uuid: z.string(),
    organization: organizationSchema.omit({
      id: true,
    }),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
  })

export type UserResponseDto = z.infer<typeof userResponseSchema>
