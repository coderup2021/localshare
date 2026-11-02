import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { DEFAULT_ADMIN_PASSWORD } from '@localshare/contracts'

import { createApp } from '../../app'
import { ensureDefaultAdmin } from '../../db/bootstrap'
import { initializeDatabase, type DatabaseClient } from '../../db/client'
import { AdminAuthService } from './admin-auth.service'

let database: DatabaseClient
let dataDir: string

function extractSessionCookie(response: Response) {
  const cookie = response.headers.get('set-cookie')
  if (!cookie) throw new Error('Session cookie was not set')
  return cookie.split(';')[0] ?? cookie
}

describe('admin authentication', () => {
  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'localshare-auth-'))
    database = initializeDatabase(dataDir)
    await ensureDefaultAdmin(database)
    await ensureDefaultAdmin(database)
  })

  afterAll(() => {
    database.sqlite.close()
    rmSync(dataDir, { recursive: true, force: true })
  })

  test('logs in, protects the session, and changes the password', async () => {
    const service = new AdminAuthService(database)
    const app = createApp({ isDatabaseReady: () => true, adminAuth: service })
    const origin = 'http://localhost:7777'

    const login = await app.request('/api/v1/admin/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin,
      },
      body: JSON.stringify({
        username: 'localShare',
        password: DEFAULT_ADMIN_PASSWORD,
      }),
    })

    expect(login.status).toBe(200)
    expect(await login.json()).toMatchObject({
      admin: {
        username: 'localShare',
        mustChangePassword: true,
      },
    })

    const cookie = extractSessionCookie(login)
    const setCookie = login.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')

    const productionOriginLogin = await app.request('/api/v1/admin/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:8888',
      },
      body: JSON.stringify({
        username: 'localShare',
        password: DEFAULT_ADMIN_PASSWORD,
      }),
    })
    expect(productionOriginLogin.status).toBe(200)

    const anonymousSession = await app.request('/api/v1/admin/auth/session')
    expect(anonymousSession.status).toBe(200)
    expect(await anonymousSession.json()).toEqual({ admin: null })

    const me = await app.request('/api/v1/admin/auth/me', {
      headers: { cookie },
    })
    expect(me.status).toBe(200)

    const changed = await app.request('/api/v1/admin/auth/password', {
      method: 'PATCH',
      headers: {
        cookie,
        'content-type': 'application/json',
        origin,
      },
      body: JSON.stringify({
        currentPassword: DEFAULT_ADMIN_PASSWORD,
        newPassword: 'new-password-123',
      }),
    })
    expect(changed.status).toBe(200)

    const revoked = await app.request('/api/v1/admin/auth/me', {
      headers: { cookie },
    })
    expect(revoked.status).toBe(401)

    const oldPassword = await app.request('/api/v1/admin/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin,
      },
      body: JSON.stringify({
        username: 'localShare',
        password: DEFAULT_ADMIN_PASSWORD,
      }),
    })
    expect(oldPassword.status).toBe(401)

    const newPassword = await app.request('/api/v1/admin/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin,
      },
      body: JSON.stringify({
        username: 'localShare',
        password: 'new-password-123',
      }),
    })
    expect(newPassword.status).toBe(200)
    expect(await newPassword.json()).toMatchObject({
      admin: {
        username: 'localShare',
        mustChangePassword: false,
      },
    })
  })

  test('rejects untrusted origins and rate limits repeated failures', async () => {
    const app = createApp({
      isDatabaseReady: () => true,
      adminAuth: new AdminAuthService(database),
    })

    const crossOrigin = await app.request('/api/v1/admin/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://malicious.example:7777',
      },
      body: JSON.stringify({
        username: 'localShare',
        password: 'wrong-password',
      }),
    })
    expect(crossOrigin.status).toBe(403)

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.request('/api/v1/admin/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:7777',
          'x-forwarded-for': '192.168.1.50',
        },
        body: JSON.stringify({
          username: 'localShare',
          password: 'wrong-password',
        }),
      })
      expect(response.status).toBe(401)
    }

    const limited = await app.request('/api/v1/admin/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:7777',
        'x-forwarded-for': '192.168.1.50',
      },
      body: JSON.stringify({
        username: 'localShare',
        password: 'wrong-password',
      }),
    })
    expect(limited.status).toBe(429)
  })
})
