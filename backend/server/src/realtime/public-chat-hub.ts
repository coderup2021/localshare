import type { PublicMessage, PublicRealtimeEvent } from '@localshare/contracts'

type Listener = (event: PublicRealtimeEvent) => void

export class PublicChatHub {
  private readonly listeners = new Set<Listener>()

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  ready(latestSeq: number): PublicRealtimeEvent {
    return {
      type: 'ready',
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      latestSeq,
    }
  }

  publish(message: PublicMessage) {
    const event: PublicRealtimeEvent = {
      type: 'message.created',
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      message,
    }

    for (const listener of this.listeners) {
      listener(event)
    }
  }
}
