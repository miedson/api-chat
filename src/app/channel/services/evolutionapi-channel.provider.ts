import type { HttpClient } from '@/app/common/interfaces/http-client'
import { ChannelConnectionStatus } from '@/generated/prisma/enums'
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

type CreateInstanceEvolutionApiResponse = {
  instance?: {
    instanceId?: string
    instanceName?: string
    integration?: string
    status?: string
  }
  qrcode?: {
    base64?: string
  }
}

function extractTextMessage(payload: any): string | null {
  const direct = payload?.data?.message?.conversation
  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim()
  }

  const extended = payload?.data?.message?.extendedTextMessage?.text
  if (typeof extended === 'string' && extended.trim()) {
    return extended.trim()
  }

  const imageCaption = payload?.data?.message?.imageMessage?.caption
  if (typeof imageCaption === 'string' && imageCaption.trim()) {
    return imageCaption.trim()
  }

  return null
}

function normalizeContactId(value: string): string {
  return value
    .replace('@s.whatsapp.net', '')
    .replace('@c.us', '')
    .replace(/\D/g, '')
}

function extractInstanceKey(payload: any): string | null {
  const candidates = [
    payload?.instance,
    payload?.instanceName,
    payload?.data?.instanceName,
    payload?.data?.instance,
    payload?.sender,
    payload?.data?.instance?.instanceName,
    payload?.data?.instance?.name,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return null
}

export class EvolutionApiChannelProvider implements WhatsAppChannelProvider {
  private readonly url = (process.env.EVO_API_URL ?? '').replace(/\/$/, '')
  private readonly token = process.env.EVO_API_TOKEN ?? ''

  constructor(private readonly httpClient: HttpClient) {}

  private async configureWebhook(
    instanceKey: string,
    webhookUrl: string,
    webhookSecret: string,
  ) {
    const webhookObject = {
      enabled: true,
      url: webhookUrl,
      webhook_by_events: false,
      webhook_base64: false,
      events: ['MESSAGES_UPSERT', 'QRCODE_UPDATED', 'CONNECTION_UPDATE'],
      headers: {
        'x-webhook-secret': webhookSecret,
      },
    }

    const payloads = [
      {
        instance: {
          webhook: webhookObject,
        },
      },
      {
        webhook: webhookObject,
      },
      {
        enabled: true,
        webhook: webhookUrl,
        webhook_by_events: false,
        webhook_base64: false,
        events: ['MESSAGES_UPSERT', 'QRCODE_UPDATED', 'CONNECTION_UPDATE'],
        headers: {
          'x-webhook-secret': webhookSecret,
        },
      },
      {
        ...webhookObject,
      },
    ]

    let configured = false
    let lastError: Error | null = null

    for (const payload of payloads) {
      try {
        await this.httpClient.post(
          `${this.url}/webhook/set/${instanceKey}`,
          payload,
          {
            headers: {
              apikey: this.token,
            },
          },
        )
        configured = true
        break
      } catch (error) {
        lastError = error as Error
      }
    }

    if (!configured) {
      throw new Error(
        `Evolution webhook/set failed for all payload variants: ${lastError?.message ?? 'unknown error'}`,
      )
    }

    const { data: webhookState } = await this.httpClient.get<{
      enabled?: boolean
      url?: string
      webhook?: string
    }>(`${this.url}/webhook/find/${instanceKey}`, {
      headers: {
        apikey: this.token,
      },
    })

    const webhookValue = webhookState?.url ?? webhookState?.webhook

    if (!webhookState?.enabled || !webhookValue) {
      throw new Error('Evolution webhook was not enabled for the instance')
    }
  }

  async connect(
    input: ConnectWhatsAppChannelInput,
  ): Promise<ConnectWhatsAppChannelResult> {
    const { data } = await this.httpClient.post<
      CreateInstanceEvolutionApiResponse,
      {
        instanceName: string
        number: string
        qrcode: boolean
        integration: 'WHATSAPP-BAILEYS'
      }
    >(
      `${this.url}/instance/create`,
      {
        instanceName: input.instanceName,
        number: input.phone,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      },
      {
        headers: {
          apikey: this.token,
        },
      },
    )

    if (!data?.instance?.instanceName) {
      throw new Error('Failed to create Evolution instance')
    }

    if (input.webhookUrl) {
      await this.syncWebhook({
        instanceKey: data.instance.instanceName,
        webhookUrl: input.webhookUrl,
        webhookSecret: input.webhookSecret,
      })
    }

    return {
      status: data?.qrcode?.base64
        ? ChannelConnectionStatus.pending_qr
        : ChannelConnectionStatus.connected,
      providerExternalId: data.instance.instanceId,
      providerInstanceKey: data.instance.instanceName,
      qrCodeBase64: data?.qrcode?.base64,
      metadata: {
        integration: data.instance.integration,
        status: data.instance.status,
      },
    }
  }

  async syncWebhook(input: SyncWhatsAppWebhookInput): Promise<void> {
    try {
      await this.configureWebhook(
        input.instanceKey,
        input.webhookUrl,
        input.webhookSecret,
      )
    } catch (error) {
      throw new Error(
        `Failed to configure Evolution webhook for instance ${input.instanceKey}: ${
          (error as Error).message
        }`,
      )
    }
  }

  async sendMessage(
    input: SendWhatsAppMessageInput,
  ): Promise<SendWhatsAppMessageResult> {
    const to = normalizeContactId(input.to)

    const { data } = await this.httpClient.post<
      { key?: { id?: string } },
      { number: string; text: string; delay: number }
    >(
      `${this.url}/message/sendText/${input.instanceKey}`,
      {
        number: to,
        text: input.text,
        delay: 0,
      },
      {
        headers: {
          apikey: this.token,
        },
      },
    )

    return {
      externalMessageId: data?.key?.id,
      metadata: {},
    }
  }

  async markMessagesAsRead(
    input: MarkWhatsAppMessagesReadInput,
  ): Promise<void> {
    const toJid = `${normalizeContactId(input.externalContactId)}@s.whatsapp.net`
    const payloadVariants = [
      { remoteJid: toJid, id: input.externalMessageId },
      { remoteJid: toJid },
      { readMessages: [{ remoteJid: toJid, id: input.externalMessageId }] },
      { jid: toJid, messageId: input.externalMessageId },
    ]
    const endpoints = [
      `${this.url}/chat/markMessageAsRead/${input.instanceKey}`,
      `${this.url}/chat/readMessages/${input.instanceKey}`,
      `${this.url}/chat/markMessageAsRead`,
    ]

    let lastError: Error | null = null

    for (const endpoint of endpoints) {
      for (const payload of payloadVariants) {
        try {
          await this.httpClient.post(endpoint, payload, {
            headers: {
              apikey: this.token,
            },
          })
          return
        } catch (error) {
          lastError = error as Error
        }
      }
    }

    throw new Error(
      `Failed to mark messages as read in Evolution: ${lastError?.message ?? 'unknown error'}`,
    )
  }

  parseWebhook(payload: unknown): WhatsAppWebhookEvent[] {
    const body = payload as any
    const eventName = String(body?.event ?? '').toUpperCase()
    const instanceKey = extractInstanceKey(body)

    if (!instanceKey || typeof instanceKey !== 'string') {
      return []
    }

    if (
      eventName.includes('QRCODE') ||
      eventName.includes('QR_CODE') ||
      body?.data?.qrcode?.base64
    ) {
      const qrBase64 = body?.data?.qrcode?.base64 ?? body?.qrcode?.base64
      if (typeof qrBase64 === 'string' && qrBase64.length > 0) {
        return [
          {
            kind: 'qr_code',
            instanceKey,
            qrCodeBase64: qrBase64,
          },
        ]
      }
    }

    if (eventName.includes('CONNECTION')) {
      const state = String(
        body?.data?.state ?? body?.data?.status ?? body?.state ?? '',
      ).toLowerCase()

      const status =
        state.includes('open') ||
        state.includes('connected') ||
        state.includes('online')
          ? ChannelConnectionStatus.connected
          : state.includes('close') ||
              state.includes('disconnected') ||
              state.includes('offline')
            ? ChannelConnectionStatus.disconnected
            : ChannelConnectionStatus.pending_qr

      return [
        {
          kind: 'connection_status',
          instanceKey,
          status,
        },
      ]
    }

    if (eventName.includes('MESSAGE')) {
      const text = extractTextMessage(body)
      const remoteJid =
        body?.data?.key?.remoteJid ?? body?.data?.message?.key?.remoteJid
      const fromMe = Boolean(body?.data?.key?.fromMe)

      if (!text || !remoteJid || fromMe) {
        return []
      }

      const happenedAtUnix = Number(body?.data?.messageTimestamp ?? Date.now())
      const happenedAt =
        happenedAtUnix > 1e12
          ? new Date(happenedAtUnix)
          : new Date(happenedAtUnix * 1000)

      const externalContactId = normalizeContactId(String(remoteJid))
      if (!externalContactId) {
        return []
      }

      return [
        {
          kind: 'incoming_message',
          instanceKey,
          externalMessageId: body?.data?.key?.id,
          externalContactId,
          externalContactName:
            body?.data?.pushName ?? body?.data?.participant ?? undefined,
          text,
          happenedAt,
        },
      ]
    }

    return []
  }
}
