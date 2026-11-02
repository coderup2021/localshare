import { describe, expect, test } from 'bun:test'

import { apiErrorSchema, healthStatusSchema } from './index'

describe('API contracts', () => {
  test('accepts a healthy response', () => {
    const parsed = healthStatusSchema.parse({
      status: 'ok',
      service: 'localshare-server',
      timestamp: '2026-11-02T10:00:00.000Z',
      checks: { database: 'up' },
    })

    expect(parsed.checks?.database).toBe('up')
  })

  test('accepts a stable API error envelope', () => {
    const parsed = apiErrorSchema.parse({
      error: {
        code: 'ADMIN_UNAUTHORIZED',
        message: 'Administrator login is required',
        requestId: 'req-test',
      },
    })

    expect(parsed.error.code).toBe('ADMIN_UNAUTHORIZED')
  })
})
