import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createApp } from '../../app'
import { ensurePublicConversation } from '../../db/bootstrap'
import { initializeDatabase, type DatabaseClient } from '../../db/client'
import { AttachmentService } from './attachment.service'
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

async function bootstrapVisitor() {
  const response = await app.request('/api/v1/public/bootstrap')
  expect(response.status).toBe(200)
  return {
    ...cookieFrom(response),
    body: (await response.json()) as {
      visitor: { id: string; displayName: string }
      conversation: { id: string; title: string }
    },
  }
}

describe('public chat', () => {
  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'localshare-public-'))
    database = initializeDatabase(dataDir)
    await ensurePublicConversation(database)
    const attachments = new AttachmentService(database, dataDir)
    app = createApp({
      isDatabaseReady: () => true,
      publicChat: new PublicChatService(database, attachments),
      attachments,
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
    expect(first.cookie).toContain('localshare_visitor=')
    expect(first.rawCookie).toContain('HttpOnly')
  })

  test('requires a visitor cookie to send messages', async () => {
    const response = await app.request('/api/v1/public/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
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

  test('allows any LAN visitor to send messages', async () => {
    const remote = await bootstrapVisitor()

    const response = await app.request('/api/v1/public/messages', {
      method: 'POST',
      headers: {
        cookie: remote.cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text: 'remote write',
        clientRequestId: crypto.randomUUID(),
      }),
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      text: 'remote write',
      senderType: 'visitor',
    })
  })

  test('uploads, attaches, downloads, and ranges an attachment', async () => {
    const visitor = await bootstrapVisitor()

    const uploaded = await app.request('/api/v1/public/uploads', {
      method: 'POST',
      headers: {
        cookie: visitor.cookie,
        'content-type': 'text/plain',
        'x-file-name': encodeURIComponent('sample.txt'),
      },
      body: '0123456789',
    })
    expect(uploaded.status).toBe(201)
    const attachment = (await uploaded.json()) as {
      id: string
      name: string
      kind: string
      url: string
    }
    expect(attachment).toMatchObject({
      name: 'sample.txt',
      kind: 'file',
    })

    const sent = await app.request('/api/v1/public/messages', {
      method: 'POST',
      headers: {
        cookie: visitor.cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text: '附件说明',
        attachmentId: attachment.id,
        clientRequestId: crypto.randomUUID(),
      }),
    })
    expect(sent.status).toBe(201)
    expect(await sent.json()).toMatchObject({
      kind: 'file',
      text: '附件说明',
      attachment: {
        id: attachment.id,
        name: 'sample.txt',
      },
    })

    const downloaded = await app.request(attachment.url)
    expect(downloaded.status).toBe(200)
    expect(downloaded.headers.get('content-disposition')).toContain('attachment')
    expect(await downloaded.text()).toBe('0123456789')

    const ranged = await app.request(attachment.url, {
      headers: { range: 'bytes=2-5' },
    })
    expect(ranged.status).toBe(206)
    expect(ranged.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(await ranged.text()).toBe('2345')
  })

  test('classifies inline images and videos by MIME type', async () => {
    const visitor = await bootstrapVisitor()

    for (const [name, mimeType, expectedKind] of [
      ['pixel.png', 'image/png', 'image'],
      ['clip.mp4', 'video/mp4', 'video'],
      ['unsafe.svg', 'image/svg+xml', 'file'],
    ] as const) {
      const uploaded = await app.request('/api/v1/public/uploads', {
        method: 'POST',
        headers: {
          cookie: visitor.cookie,
          'content-type': mimeType,
          'x-file-name': encodeURIComponent(name),
        },
        body: 'fixture-bytes',
      })
      expect(uploaded.status).toBe(201)
      expect(await uploaded.json()).toMatchObject({
        name,
        mimeType,
        kind: expectedKind,
      })
    }
  })
})
