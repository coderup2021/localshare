import { describe, expect, test } from 'bun:test'

import { PublicChatHub } from './public-chat-hub'

describe('PublicChatHub', () => {
  test('broadcasts message events and unsubscribes cleanly', () => {
    const hub = new PublicChatHub()
    const events: unknown[] = []
    const unsubscribe = hub.subscribe((event) => events.push(event))

    hub.publish({
      id: 'message-1',
      seq: 1,
      senderType: 'visitor',
      senderId: 'visitor-1',
      senderName: '访客',
      kind: 'text',
      text: 'hello',
      createdAt: new Date().toISOString(),
    })
    unsubscribe()
    hub.publish({
      id: 'message-2',
      seq: 2,
      senderType: 'visitor',
      senderId: 'visitor-1',
      senderName: '访客',
      kind: 'text',
      text: 'not delivered',
      createdAt: new Date().toISOString(),
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'message.created',
      message: { id: 'message-1' },
    })
  })
})
