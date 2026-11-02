import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createApp } from '../../app'
import { ensurePublicConversation } from '../../db/bootstrap'
import { initializeDatabase, type DatabaseClient } from '../../db/client'
import { PublicChatService } from './public-chat.service'

let database: DatabaseClient
let dataDir: string
let app: ReturnType<typeof createApp>

function cookieFrom(response: Response) {
  const cookie = response.headers.get('set-cookie')
  if (!cookie) throw new Error('Visitor cookie was not set')
  return {
    cookie: cookie.split(';')[0] ?? cookie,
    rawCookie: cookie,
  }
}

async function bootstrapVisitor(clientAddress = '127.0.0.1') {
  const response = await app.request('/api/v1/public/bootstrap', {
    headers: {
      'x-localshare-client-ip': clientAddress,
    },
  })
  expect(response.status).toBe(200)
  return {
    ...cookieFrom(response),
    clientAddress,
    body: (await response.json()) as {
      visitor: { id: string; displayName: string }
      conversation: { id: string; title: string }
      canSend: boolean
    },
  }
}

describe('public chat', () => {
  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'localshare-public-'))
    database = initializeDatabase(dataDir)
    await ensurePublicConversation(database)
    app = createApp({
      isDatabaseReady: () => true,
      publicChat: new PublicChatService(database),
    })
  })

  afterAll(() => {
    database.sqlite.close()
    rmSync(dataDir, { recursive: true, force: true })
  })

  test('creates an anonymous visitor and a visible public conversation', async () => {
    const first = await bootstrapVisitor()

    expect(first.body.visitor.id).toBeTruthy()
    expect(first.body.visitor.displayName).toMatch(/^访客-/)
    expect(first.body.conversation.title).toBe('公共频道')
    expect(first.body.canSend).toBe(true)
    expect(first.cookie).toContain('localshare_visitor=')
    expect(first.rawCookie).toContain('HttpOnly')
  })

  test('requires a visitor cookie to send messages', async () => {
    const response = await app.request('/api/v1/public/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-localshare-client-ip': '127.0.0.1',
      },
      body: JSON.stringify({
        text: 'hello',
        clientRequestId: crypto.randomUUID(),
      }),
    })

    expect(response.status).toBe(401)
  })

  test('sends idempotent text and exposes it to every visitor', async () => {
    const first = await bootstrapVisitor()
    const second = await bootstrapVisitor()
    const clientRequestId = crypto.randomUUID()
    const request = {
      method: 'POST',
      headers: {
        cookie: first.cookie,
        'content-type': 'application/json',
        'x-localshare-client-ip': first.clientAddress,
      },
      body: JSON.stringify({ text: '局域网你好', clientRequestId }),
    } satisfies RequestInit

    const created = await app.request('/api/v1/public/messages', request)
    expect(created.status).toBe(201)
    const createdMessage = (await created.json()) as { id: string; seq: number; text: string }
    expect(createdMessage).toMatchObject({ seq: 1, text: '局域网你好' })

    const replay = await app.request('/api/v1/public/messages', request)
    expect(replay.status).toBe(200)
    expect(await replay.json()).toMatchObject({ id: createdMessage.id })

    const list = await app.request('/api/v1/public/messages', {
      headers: {
        cookie: second.cookie,
        'x-localshare-client-ip': second.clientAddress,
      },
    })
    expect(list.status).toBe(200)
    expect(await list.json()).toMatchObject({
      messages: [{ id: createdMessage.id, text: '局域网你好' }],
      hasMore: false,
    })
  })

  test('supports stable before-sequence pagination', async () => {
    const visitor = await bootstrapVisitor()

    for (const text of ['第二条', '第三条']) {
      const response = await app.request('/api/v1/public/messages', {
        method: 'POST',
        headers: {
          cookie: visitor.cookie,
          'content-type': 'application/json',
          'x-localshare-client-ip': visitor.clientAddress,
        },
        body: JSON.stringify({
          text,
          clientRequestId: crypto.randomUUID(),
        }),
      })
      expect(response.status).toBe(201)
    }

    const firstPage = await app.request('/api/v1/public/messages?limit=2')
    const firstBody = (await firstPage.json()) as {
      messages: Array<{ seq: number; text: string }>
      hasMore: boolean
      nextBeforeSeq: number | null
    }
    expect(firstBody.messages.map((message) => message.text)).toEqual(['第二条', '第三条'])
    expect(firstBody.hasMore).toBe(true)
    expect(firstBody.nextBeforeSeq).toBe(2)

    const secondPage = await app.request(
      `/api/v1/public/messages?limit=2&beforeSeq=${firstBody.nextBeforeSeq}`,
    )
    expect(await secondPage.json()).toMatchObject({
      messages: [{ text: '局域网你好' }],
      hasMore: false,
      nextBeforeSeq: null,
    })
  })

  test('allows non-loopback visitors to read but not send', async () => {
    const remote = await bootstrapVisitor('192.168.1.50')
    expect(remote.body.canSend).toBe(false)

    const response = await app.request('/api/v1/public/messages', {
      method: 'POST',
      headers: {
        cookie: remote.cookie,
        'content-type': 'application/json',
        'x-localshare-client-ip': remote.clientAddress,
      },
      body: JSON.stringify({
        text: 'remote write',
        clientRequestId: crypto.randomUUID(),
      }),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      error: { code: 'PUBLIC_SEND_LOCAL_ONLY' },
    })
  })
})
