import type { ChannelConnectionStatus } from '@/generated/prisma/enums'

export type ConnectInstagramChannelInput = {
  connectionPublicId: string
  instagramAccountId: string
  pageId: string
  accessToken: string
  webhookVerifyToken?: string
}

export type ConnectInstagramChannelResult = {
  status: ChannelConnectionStatus
  providerExternalId?: string
  providerInstanceKey?: string
  metadata?: Record<string, unknown>
}

export type SendInstagramDirectMessageInput = {
  instagramAccountId: string
  accessToken: string
  recipientInstagramScopedId: string
  text: string
}

export type SendInstagramDirectMessageResult = {
  externalMessageId?: string
}

export type ReplyInstagramCommentInput = {
  commentId: string
  accessToken: string
  text: string
}

export type ReplyInstagramCommentResult = {
  externalMessageId?: string
}

export interface InstagramChannelProvider {
  connect(
    input: ConnectInstagramChannelInput,
  ): Promise<ConnectInstagramChannelResult>
  sendDirectMessage(
    input: SendInstagramDirectMessageInput,
  ): Promise<SendInstagramDirectMessageResult>
  replyToComment(
    input: ReplyInstagramCommentInput,
  ): Promise<ReplyInstagramCommentResult>
}
