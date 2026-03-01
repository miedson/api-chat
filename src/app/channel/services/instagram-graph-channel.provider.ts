import { ChannelConnectionStatus } from '@/generated/prisma/enums'
import { FetchHttpClientAdapter } from '@/app/common/adapters/fetch-httpclient.adapter'
import type {
  ConnectInstagramChannelInput,
  ConnectInstagramChannelResult,
  InstagramChannelProvider,
  ReplyInstagramCommentInput,
  ReplyInstagramCommentResult,
  SendInstagramDirectMessageInput,
  SendInstagramDirectMessageResult,
} from '../interfaces/instagram-channel.provider'

export class InstagramGraphChannelProvider implements InstagramChannelProvider {
  private readonly graphUrl = (process.env.META_GRAPH_API_URL ?? 'https://graph.facebook.com/v23.0').replace(/\/$/, '')
  private readonly httpClient = new FetchHttpClientAdapter()

  async connect(
    input: ConnectInstagramChannelInput,
  ): Promise<ConnectInstagramChannelResult> {
    return {
      status: ChannelConnectionStatus.connected,
      providerExternalId: input.instagramAccountId,
      providerInstanceKey: input.pageId,
      metadata: {
        instagramAccountId: input.instagramAccountId,
        pageId: input.pageId,
        accessToken: input.accessToken,
        webhookVerifyToken: input.webhookVerifyToken,
      },
    }
  }

  async sendDirectMessage(
    input: SendInstagramDirectMessageInput,
  ): Promise<SendInstagramDirectMessageResult> {
    const { data } = await this.httpClient.post<{ message_id?: string }>(
      `${this.graphUrl}/${encodeURIComponent(input.instagramAccountId)}/messages?access_token=${encodeURIComponent(input.accessToken)}`,
      {
        recipient: { id: input.recipientInstagramScopedId },
        message: { text: input.text },
      },
    )

    return {
      externalMessageId: data?.message_id,
    }
  }

  async replyToComment(
    input: ReplyInstagramCommentInput,
  ): Promise<ReplyInstagramCommentResult> {
    const { data } = await this.httpClient.post<{ id?: string }>(
      `${this.graphUrl}/${encodeURIComponent(input.commentId)}/replies?access_token=${encodeURIComponent(input.accessToken)}`,
      {
        message: input.text,
      },
    )

    return {
      externalMessageId: data?.id,
    }
  }
}
