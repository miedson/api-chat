export interface ChannelProvider<T = unknown, K = unknown> {
  connect(connection: T): Promise<K>
}
