import { ConversationStatus, MessageType } from '@/generated/prisma/enums'
import { z } from 'zod'

export const conversationSchema = z.object({
  id: z.string(),
  subject: z.string().nullable(),
  status: z.enum(ConversationStatus),
  channel: z.string().nullable(),
  externalContactName: z.string().nullable(),
  assignedTo: z
    .object({
      id: z.string(),
      name: z.string(),
      displayName: z.string().nullable(),
      email: z.string(),
    })
    .nullable(),
  participants: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      displayName: z.string().nullable(),
      email: z.string(),
    }),
  ),
  lastMessage: z
    .object({
      id: z.string(),
      content: z.string(),
      type: z.enum(MessageType),
      createdAt: z.string(),
      sender: z
        .object({
          id: z.string(),
          name: z.string(),
          displayName: z.string().nullable(),
        })
        .nullable(),
    })
    .nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const boardResponseSchema = z.object({
  awaiting: z.array(conversationSchema),
  inProgress: z.array(conversationSchema),
  completed: z.array(conversationSchema),
})

export const createConversationSchema = z.object({
  subject: z.string().max(120).optional(),
  channel: z.string().max(40).optional(),
  participantPublicIds: z.array(z.string().uuid()).optional(),
})

export const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  content: z.string(),
  type: z.enum(MessageType),
  createdAt: z.string(),
  sender: z
    .object({
      id: z.string(),
      name: z.string(),
      displayName: z.string().nullable(),
    })
    .nullable(),
})

export const createMessageSchema = z.object({
  content: z.string().min(1).max(4000),
  type: z.enum(MessageType).optional(),
})

export const conversationParamsSchema = z.object({
  conversationId: z.string().uuid(),
})

export const transitionConversationStatusSchema = z.object({
  toStatus: z.enum(ConversationStatus),
})

export const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

export const markConversationReadResponseSchema = z.object({
  updatedCount: z.number().int().min(0),
  providerNotified: z.boolean(),
})
