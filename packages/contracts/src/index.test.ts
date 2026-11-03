import { describe, expect, test } from 'bun:test'

import {
  ADMIN_USERNAME,
  adminPasswordChangeRequestSchema,
  adminLoginRequestSchema,
  apiErrorSchema,
  createPublicMessageRequestSchema,
  discoveryQuerySchema,
  discoveryResponseSchema,
  healthStatusSchema,
  isPrivateIPv4Address,
  publicMessageSchema,
  publicMessageSearchResponseSchema,
  publicRealtimeEventSchema,
} from './index'

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

  test('validates desktop discovery queries and responses', () => {
    const requestId = crypto.randomUUID()
    expect(
      discoveryQuerySchema.safeParse({
        protocol: 'localshare-discovery',
        version: 1,
        type: 'query',
        requestId,
        client: 'desktop',
        clientVersion: '0.1.0',
      }).success,
    ).toBe(true)

    expect(
      discoveryResponseSchema.safeParse({
        protocol: 'localshare-discovery',
        version: 1,
        type: 'response',
        requestId,
        serverId: crypto.randomUUID(),
        serverName: 'LocalShare host',
        serverVersion: '0.2.0',
        webPort: 8888,
        capabilities: ['public-chat-v1'],
        issuedAt: '2026-11-03T10:00:00.000Z',
      }).success,
    ).toBe(true)
  })

  test('rejects unsupported discovery versions', () => {
    expect(
      discoveryQuerySchema.safeParse({
        protocol: 'localshare-discovery',
        version: 2,
        type: 'query',
        requestId: crypto.randomUUID(),
        client: 'desktop',
        clientVersion: '0.1.0',
      }).success,
    ).toBe(false)
  })

  test('distinguishes LAN and public IPv4 sources', () => {
    expect(isPrivateIPv4Address('192.168.1.20')).toBe(true)
    expect(isPrivateIPv4Address('10.20.30.40')).toBe(true)
    expect(isPrivateIPv4Address('127.0.0.1')).toBe(true)
    expect(isPrivateIPv4Address('8.8.8.8')).toBe(false)
    expect(isPrivateIPv4Address('not-an-ip')).toBe(false)
  })

  test('accepts the only supported admin login', () => {
    expect(
      adminLoginRequestSchema.parse({
        username: ADMIN_USERNAME,
        password: '12345678',
      }),
    ).toEqual({ username: 'localShare', password: '12345678' })
  })

  test('rejects short passwords when changing credentials', () => {
    expect(
      adminPasswordChangeRequestSchema.safeParse({
        currentPassword: '12345678',
        newPassword: 'short',
      }).success,
    ).toBe(false)
  })

  test('accepts text messages and rejects blank content', () => {
    const request = {
      text: 'hello',
      clientRequestId: crypto.randomUUID(),
    }
    expect(createPublicMessageRequestSchema.safeParse(request).success).toBe(true)
    expect(createPublicMessageRequestSchema.safeParse({ ...request, text: '   ' }).success).toBe(
      false,
    )
  })

  test('validates public message responses', () => {
    expect(
      publicMessageSchema.safeParse({
        id: 'message-1',
        seq: 1,
        senderType: 'visitor',
        senderId: 'visitor-1',
        senderName: '访客',
        kind: 'text',
        text: 'hello',
        createdAt: '2026-11-02T10:00:00.000Z',
      }).success,
    ).toBe(true)
  })

  test('validates realtime message events', () => {
    expect(
      publicRealtimeEventSchema.safeParse({
        type: 'message.created',
        eventId: crypto.randomUUID(),
        occurredAt: '2026-11-02T10:00:00.000Z',
        message: {
          id: 'message-1',
          seq: 1,
          senderType: 'visitor',
          senderId: 'visitor-1',
          senderName: '访客',
          kind: 'text',
          text: 'hello',
          createdAt: '2026-11-02T10:00:00.000Z',
        },
      }).success,
    ).toBe(true)
  })

  test('validates recalled message events', () => {
    expect(
      publicRealtimeEventSchema.safeParse({
        type: 'message.recalled',
        eventId: crypto.randomUUID(),
        occurredAt: '2026-11-02T10:01:00.000Z',
        message: {
          id: 'message-1',
          seq: 1,
          senderType: 'visitor',
          senderId: 'visitor-1',
          senderName: '访客',
          kind: 'text',
          text: '',
          createdAt: '2026-11-02T10:00:00.000Z',
          recalledAt: '2026-11-02T10:01:00.000Z',
        },
      }).success,
    ).toBe(true)
  })

  test('validates message search responses', () => {
    expect(
      publicMessageSearchResponseSchema.safeParse({
        query: 'hello',
        messages: [
          {
            id: 'message-1',
            seq: 1,
            senderType: 'visitor',
            senderId: 'visitor-1',
            senderName: '访客',
            kind: 'text',
            text: 'hello',
            createdAt: '2026-11-02T10:00:00.000Z',
          },
        ],
      }).success,
    ).toBe(true)
  })
})
