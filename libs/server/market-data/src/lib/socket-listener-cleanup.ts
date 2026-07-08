export type SocketEventHandler = (...args: unknown[]) => void;

export interface ListenerCleanupCapable {
  off?(event: string, handler: SocketEventHandler): void;
  removeListener?(event: string, handler: SocketEventHandler): void;
  removeAllListeners?(event?: string): void;
}

export function detachSocketHandler(
  socket: ListenerCleanupCapable,
  event: string,
  handler: SocketEventHandler,
): void {
  if (typeof socket.off === 'function') {
    socket.off(event, handler);
    return;
  }
  if (typeof socket.removeListener === 'function') {
    socket.removeListener(event, handler);
    return;
  }
  if (typeof socket.removeAllListeners === 'function') {
    socket.removeAllListeners(event);
  }
}
