import { publicRealtimeEventSchema, type PublicMessage } from '@localshare/contracts'

type RealtimeOptions = {
  onMessage: (message: PublicMessage) => void
  onMessageRecalled: (message: PublicMessage) => void
  onConnected: () => void
  onDisconnected: () => void
}

export function connectPublicRealtime(options: RealtimeOptions) {
  let socket: WebSocket | null = null
  let reconnectTimer: number | null = null
  let stopped = false
  let retryDelay = 1_000

  const connect = () => {
    if (stopped) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    socket = new WebSocket(`${protocol}//${window.location.host}/ws`)

    socket.addEventListener('open', () => {
      retryDelay = 1_000
      options.onConnected()
    })

    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return

      try {
        const parsed = publicRealtimeEventSchema.safeParse(JSON.parse(event.data))
        if (!parsed.success) return

        if (parsed.data.type === 'message.created') {
          options.onMessage(parsed.data.message)
        } else if (parsed.data.type === 'message.recalled') {
          options.onMessageRecalled(parsed.data.message)
        }
      } catch {
        // Ignore malformed realtime frames; HTTP history remains authoritative.
      }
    })

    socket.addEventListener('close', () => {
      options.onDisconnected()
      if (stopped) return

      reconnectTimer = window.setTimeout(connect, retryDelay)
      retryDelay = Math.min(retryDelay * 2, 10_000)
    })
  }

  connect()

  return () => {
    stopped = true
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
    socket?.close()
  }
}
