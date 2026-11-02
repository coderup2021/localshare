import { describe, expect, test } from 'bun:test'

import { statusLabel } from './health'

describe('admin health presentation', () => {
  test('maps service state to a readable label', () => {
    expect(statusLabel('online')).toBe('服务在线')
    expect(statusLabel('offline')).toBe('服务离线')
  })
})
