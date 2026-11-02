import { describe, expect, test } from 'bun:test'

import { createClientRequestId, messageTime } from './public-chat'

describe('public chat presentation', () => {
  test('formats message timestamps without seconds', () => {
    expect(messageTime('2026-11-02T10:05:00.000Z')).toMatch(/11\/02/)
  })

  test('creates a UUID request identifier compatible with insecure LAN origins', () => {
    expect(createClientRequestId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })
})
