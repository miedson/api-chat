export interface UseCase<T = unknown, K = unknown> {
  execute(input?: T): Promise<K>
}
