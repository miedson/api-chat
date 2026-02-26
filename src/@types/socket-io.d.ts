declare module 'socket.io' {
  export class Server {
    constructor(...args: any[])
    use(fn: (...args: any[]) => void): void
    on(event: string, listener: (...args: any[]) => void): void
    to(room: string): {
      emit(event: string, payload: any): void
    }
    close(): void
  }
}
