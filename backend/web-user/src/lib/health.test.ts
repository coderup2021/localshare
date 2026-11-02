import { describe, expect, test } from 'bun:test'

import { describeHealth } from './health'

describe('health presentation', () => {
  test('describes the disconnected state', () => {
    expect(describeHealth(null)).toBe('正在连接本地服务')
  })

  test('describes a healthy API', () => {
    expect(
      describeHealth({
        status: 'ok',
        service: 'localshare-server',
        timestamp: '2026-11-02T10:00:00.000Z',
      }),
    ).toBe('本地服务已连接')
  })
})
