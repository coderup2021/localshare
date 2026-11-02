import { describe, expect, test } from 'bun:test'

import { messageTime } from './public-chat'

describe('public chat presentation', () => {
  test('formats message timestamps without seconds', () => {
    expect(messageTime('2026-11-02T10:05:00.000Z')).toMatch(/11\/02/)
  })
})
