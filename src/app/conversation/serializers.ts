import type { MessageType, ConversationStatus } from '@/generated/prisma/enums'

export function mapConversation(conversation: {
  publicId: string
  subject: string | null
  status: ConversationStatus
  channel: string | null
  externalContactName: string | null
  createdAt: Date
  updatedAt: Date
  assignedTo: {
    public_id: string
    name: string
    displayName: string | null
    email: string
  } | null
  participants: Array<{
    user: {
      public_id: string
      name: string
      displayName: string | null
      email: string
    }
  }>
  messages: Array<{
    publicId: string
    content: string
    type: MessageType
    createdAt: Date
    sender: {
      public_id: string
      name: string
      displayName: string | null
    } | null
  }>
}) {
  const lastMessage = conversation.messages[0]

  return {
    id: conversation.publicId,
    subject: conversation.subject,
    status: conversation.status,
    channel: conversation.channel,
    externalContactName: conversation.externalContactName,
    assignedTo: conversation.assignedTo
      ? {
          id: conversation.assignedTo.public_id,
          name: conversation.assignedTo.name,
          displayName: conversation.assignedTo.displayName,
          email: conversation.assignedTo.email,
        }
      : null,
    participants: conversation.participants.map((participant) => ({
      id: participant.user.public_id,
      name: participant.user.name,
      displayName: participant.user.displayName,
      email: participant.user.email,
    })),
    lastMessage: lastMessage
      ? {
          id: lastMessage.publicId,
          content: lastMessage.content,
          type: lastMessage.type,
          createdAt: lastMessage.createdAt.toISOString(),
          sender: lastMessage.sender
            ? {
                id: lastMessage.sender.public_id,
                name: lastMessage.sender.name,
                displayName: lastMessage.sender.displayName,
              }
            : null,
        }
      : null,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  }
}

export function mapMessage(message: {
  publicId: string
  content: string
  type: MessageType
  createdAt: Date
  conversation: { publicId: string }
  sender: {
    public_id: string
    name: string
    displayName: string | null
  } | null
}) {
  return {
    id: message.publicId,
    conversationId: message.conversation.publicId,
    content: message.content,
    type: message.type,
    createdAt: message.createdAt.toISOString(),
    sender: message.sender
      ? {
          id: message.sender.public_id,
          name: message.sender.name,
          displayName: message.sender.displayName,
        }
      : null,
  }
}
