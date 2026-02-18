import z from 'zod'

export const inboxSchema = z.object({
  id: z.number().int(),
  organizationId: z.number().int(),
  name: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const contactSchema = z.object({
  id: z.number().int(),
  organizationId: z.number().int(),
  name: z.string(),
  externalId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const messageSchema = z.object({
  id: z.number().int(),
  organizationId: z.number().int(),
  conversationId: z.number().int(),
  senderType: z.enum(['agent', 'contact', 'system']),
  senderId: z.number().int().nullable(),
  direction: z.enum(['inbound', 'outbound']),
  content: z.string(),
  createdAt: z.date(),
})

export const conversationSchema = z.object({
  id: z.number().int(),
  organizationId: z.number().int(),
  inboxId: z.number().int(),
  contactId: z.number().int(),
  status: z.enum(['open', 'pending', 'resolved']),
  assigneeId: z.number().int().nullable(),
  lastMessageAt: z.date().nullable(),
  lastActivityAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const messageInputSchema = z.object({
  content: z.string().trim().min(1).max(4000),
})

export const statusInputSchema = z.object({
  status: z.enum(['open', 'pending', 'resolved']),
})

export const createInboxInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
})

export const createContactInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  externalId: z.string().trim().max(120).optional(),
})

export const createConversationInputSchema = z.object({
  inboxId: z.number().int(),
  contactId: z.number().int(),
  content: z.string().trim().min(1).max(4000).optional(),
})

export const orgParamsSchema = z.object({
  orgId: z.coerce.number().int().positive(),
})

export const inboxParamsSchema = z.object({
  orgId: z.coerce.number().int().positive(),
  inboxId: z.coerce.number().int().positive(),
})

export const conversationParamsSchema = z.object({
  orgId: z.coerce.number().int().positive(),
  conversationId: z.coerce.number().int().positive(),
})

export const listConversationsQuerySchema = z.object({
  status: z.enum(['open', 'pending', 'resolved']).optional(),
  assignee: z.enum(['me', 'unassigned', 'all']).default('all'),
  search: z.string().trim().max(120).optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const listMessagesQuerySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const conversationListItemSchema = z.object({
  conversation: conversationSchema,
  contact: contactSchema,
  lastMessage: messageSchema.nullable(),
  unreadCount: z.number().int().nonnegative(),
})

export const conversationDetailSchema = z.object({
  conversation: conversationSchema,
  contact: contactSchema,
  assignee: z
    .object({
      id: z.number().int(),
      publicId: z.string(),
      name: z.string(),
      email: z.string().email(),
    })
    .nullable(),
  messages: z.array(messageSchema),
  nextCursor: z.number().int().nullable(),
})
