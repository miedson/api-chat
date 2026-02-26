import type { ChannelConnectionStatus } from '@/generated/prisma/enums'

export type ConnectWhatsAppChannelInput = {
  connectionPublicId: string
  instanceName: string
  phone: string
  webhookUrl?: string
  webhookSecret: string
}

export type ConnectWhatsAppChannelResult = {
  status: ChannelConnectionStatus
  providerExternalId?: string
  providerInstanceKey?: string
  qrCodeBase64?: string
  metadata?: Record<string, unknown>
}

export type SendWhatsAppMessageInput = {
  instanceKey: string
  to: string
  text: string
}

export type SendWhatsAppMessageResult = {
  externalMessageId?: string
  metadata?: Record<string, unknown>
}

export type MarkWhatsAppMessagesReadInput = {
  instanceKey: string
  externalContactId: string
  externalMessageId?: string
}

export type SyncWhatsAppWebhookInput = {
  instanceKey: string
  webhookUrl: string
  webhookSecret: string
}

export type WhatsAppWebhookEvent =
  | {
      kind: 'connection_status'
      instanceKey: string
      status: ChannelConnectionStatus
    }
  | {
      kind: 'qr_code'
      instanceKey: string
      qrCodeBase64: string
    }
  | {
      kind: 'incoming_message'
      instanceKey: string
      externalMessageId?: string
      externalContactId: string
      externalContactName?: string
      text: string
      happenedAt: Date
    }

export interface WhatsAppChannelProvider {
  connect(input: ConnectWhatsAppChannelInput): Promise<ConnectWhatsAppChannelResult>
  syncWebhook(input: SyncWhatsAppWebhookInput): Promise<void>
  sendMessage(input: SendWhatsAppMessageInput): Promise<SendWhatsAppMessageResult>
  markMessagesAsRead(input: MarkWhatsAppMessagesReadInput): Promise<void>
  parseWebhook(payload: unknown): WhatsAppWebhookEvent[]
}
