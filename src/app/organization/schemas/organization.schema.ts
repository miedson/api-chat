import z from 'zod'
import { validateCNPJ, validateCPF } from '@/app/common/helpers'

export const phoneSchema = z
  .string()
  .regex(/^(\+55)?\s?\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/, 'Telefone inválido')

export const organizationSchema = z.object({
  id: z.number(),
  uuid: z.string(),
  name: z.string(),
  document: z
    .string()
    .refine((value) => validateCPF(value) || validateCNPJ(value), {
      message: 'invalid document (CPF ou CNPJ)',
    }),
  phone: phoneSchema,
  domain: z.string().optional().nullable(),
  supportEmail: z.string().optional().nullable(),
  status: z.enum(['active', 'suspended']).default('active').optional(),
  slug: z.string(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
})

export type OrganizationDto = z.infer<typeof organizationSchema>

export const createOrganizationSchema = organizationSchema.pick({
  name: true,
  document: true,
  phone: true,
  domain: true,
  supportEmail: true,
  status: true,
})

export type CreateOrganizationDto = z.infer<typeof createOrganizationSchema>
