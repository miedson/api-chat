import type {
  ConnectWhatsAppChannelInput,
  ConnectWhatsAppChannelResult,
  MarkWhatsAppMessagesReadInput,
  SendWhatsAppMessageInput,
  SendWhatsAppMessageResult,
  SyncWhatsAppWebhookInput,
  WhatsAppChannelProvider,
  WhatsAppWebhookEvent,
} from '../interfaces/whatsapp-channel.provider'

export class WhatsAppCloudChannelProvider implements WhatsAppChannelProvider {
  async connect(
    _input: ConnectWhatsAppChannelInput,
  ): Promise<ConnectWhatsAppChannelResult> {
    throw new Error('WhatsApp Cloud provider is not implemented yet')
  }

  async sendMessage(
    _input: SendWhatsAppMessageInput,
  ): Promise<SendWhatsAppMessageResult> {
    throw new Error('WhatsApp Cloud provider is not implemented yet')
  }

  async markMessagesAsRead(
    _input: MarkWhatsAppMessagesReadInput,
  ): Promise<void> {
    // TODO: implementar integração com endpoint oficial de read receipt.
  }

  async syncWebhook(_input: SyncWhatsAppWebhookInput): Promise<void> {
    throw new Error('WhatsApp Cloud provider is not implemented yet')
  }

  parseWebhook(_payload: unknown): WhatsAppWebhookEvent[] {
    return []
  }
}
