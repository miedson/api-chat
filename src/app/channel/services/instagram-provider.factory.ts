import { ChannelProviderType } from '@/generated/prisma/enums'
import type { InstagramChannelProvider } from '../interfaces/instagram-channel.provider'
import { InstagramGraphChannelProvider } from './instagram-graph-channel.provider'

const providers: Partial<Record<ChannelProviderType, InstagramChannelProvider>> = {
  [ChannelProviderType.instagram_graph]: new InstagramGraphChannelProvider(),
}

export function getInstagramProvider(provider: ChannelProviderType) {
  const implementation = providers[provider]

  if (!implementation) {
    throw new Error(`Unsupported instagram provider: ${provider}`)
  }

  return implementation
}
