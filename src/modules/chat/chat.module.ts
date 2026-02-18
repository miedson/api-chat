import type { FastifyTypeInstance } from '@/types'
import { ChatService } from './chat.service'
import { initChatSocket } from './chat.realtime'
import { registerChatRoutes } from './chat.routes'

const chatService = new ChatService()

export async function chatModule(app: FastifyTypeInstance) {
  const io = await initChatSocket(app, chatService)
  await registerChatRoutes(app, chatService, io)
}
