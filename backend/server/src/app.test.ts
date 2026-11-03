import { describe, expect, test } from 'bun:test'

import { createApp } from './app'

describe('health routes', () => {
  test('returns liveness without dependencies', async () => {
    const app = createApp({ isDatabaseReady: () => false })
    const response = await app.request('/api/v1/health/live')

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      status: 'ok',
      service: 'localshare-server',
    })
    expect(response.headers.get('x-request-id')).toBeTruthy()
  })

  test('returns readiness when the database is available', async () => {
    const app = createApp({ isDatabaseReady: () => true })
    const response = await app.request('/api/v1/health/ready')

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      status: 'ok',
      checks: { database: 'up' },
    })
  })

  test('returns 503 when the database is unavailable', async () => {
    const app = createApp({ isDatabaseReady: () => false })
    const response = await app.request('/api/v1/health/ready')

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      status: 'degraded',
      checks: { database: 'down' },
    })
  })

  test('returns a stable error envelope for unknown routes', async () => {
    const app = createApp({ isDatabaseReady: () => true })
    const response = await app.request('/api/v1/missing')

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({
      error: { code: 'NOT_FOUND' },
    })
  })

  test('requires the control token before requesting shutdown', async () => {
    let shutdownRequested = false
    const app = createApp({
      isDatabaseReady: () => true,
      controlToken: 'local-control-token',
      requestShutdown: () => {
        shutdownRequested = true
      },
    })

    const unauthorized = await app.request('/api/v1/control/shutdown', {
      method: 'POST',
      headers: { 'x-localshare-control-token': 'wrong-control-token' },
    })
    expect(unauthorized.status).toBe(403)
    expect(await unauthorized.json()).toMatchObject({
      error: { code: 'CONTROL_FORBIDDEN' },
    })

    const malformedToken = await app.request('/api/v1/control/shutdown', {
      method: 'POST',
      headers: { 'x-localshare-control-token': 'é'.repeat('local-control-token'.length) },
    })
    expect(malformedToken.status).toBe(403)

    const accepted = await app.request('/api/v1/control/shutdown', {
      method: 'POST',
      headers: { 'x-localshare-control-token': 'local-control-token' },
    })
    expect(accepted.status).toBe(202)
    await Bun.sleep(40)
    expect(shutdownRequested).toBe(true)
  })
})
