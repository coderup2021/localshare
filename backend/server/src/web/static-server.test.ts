import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createWebHandler } from './static-server'

let root: string

describe('production web server', () => {
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'localshare-web-'))
    mkdirSync(join(root, 'web-user', 'assets'), { recursive: true })
    mkdirSync(join(root, 'web-admin', 'assets'), { recursive: true })
    writeFileSync(join(root, 'web-user', 'index.html'), '<h1>user</h1>')
    writeFileSync(join(root, 'web-user', 'assets', 'user.js'), 'console.log("user")')
    writeFileSync(join(root, 'web-admin', 'index.html'), '<h1>admin</h1>')
    writeFileSync(join(root, 'web-admin', 'assets', 'admin.js'), 'console.log("admin")')
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('serves both frontends and forwards API requests to the app', async () => {
    const handler = createWebHandler({
      app: {
        fetch(request) {
          return Response.json({ path: new URL(request.url).pathname })
        },
      },
      userRoot: join(root, 'web-user'),
      adminRoot: join(root, 'web-admin'),
    })

    const user = await handler(new Request('http://192.168.1.10:8888/'))
    expect(await user.text()).toBe('<h1>user</h1>')

    const admin = await handler(new Request('http://192.168.1.10:8888/admin/'))
    expect(await admin.text()).toBe('<h1>admin</h1>')

    const asset = await handler(new Request('http://192.168.1.10:8888/admin/assets/admin.js'))
    expect(asset.headers.get('cache-control')).toContain('immutable')
    expect(await asset.text()).toBe('console.log("admin")')

    const api = await handler(new Request('http://192.168.1.10:8888/api/v1/health/live'))
    expect(await api.json()).toEqual({ path: '/api/v1/health/live' })
  })
})
