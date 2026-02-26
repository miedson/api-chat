import { FetchHttpClientAdapter } from '@/app/common/adapters/fetch-httpclient.adapter'
import { ChannelProviderType } from '@/generated/prisma/enums'
import type { WhatsAppChannelProvider } from '../interfaces/whatsapp-channel.provider'
import { EvolutionApiChannelProvider } from './evolutionapi-channel.provider'
import { WhatsAppCloudChannelProvider } from './whatsapp-cloud-channel.provider'

const httpClient = new FetchHttpClientAdapter()

const providers: Record<ChannelProviderType, WhatsAppChannelProvider> = {
  [ChannelProviderType.evolution]: new EvolutionApiChannelProvider(httpClient),
  [ChannelProviderType.whatsapp_cloud]: new WhatsAppCloudChannelProvider(),
}

export function getWhatsAppProvider(provider: ChannelProviderType) {
  const implementation = providers[provider]

  if (!implementation) {
    throw new Error(`Unsupported channel provider: ${provider}`)
  }

  return implementation
}
