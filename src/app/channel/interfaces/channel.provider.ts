export interface ChannelProvider {
  connect(connection: unknown): Promise<unknown>
}
