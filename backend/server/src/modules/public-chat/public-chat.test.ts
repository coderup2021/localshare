import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, posix, win32 } from 'node:path'

import { createApp } from '../../app'
import { ensurePublicConversation } from '../../db/bootstrap'
import { initializeDatabase, type DatabaseClient } from '../../db/client'
import { AttachmentService, isPathWithin } from './attachment.service'
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

describe('attachment path containment', () => {
  test('accepts managed files on POSIX and Windows', () => {
    const posixRoot = '/srv/localshare/uploads'
    expect(isPathWithin(posixRoot, posix.join(posixRoot, 'file.txt'), posix)).toBe(true)

    const windowsRoot = 'C:\\LocalShare\\uploads'
    expect(isPathWithin(windowsRoot, win32.join(windowsRoot, 'file.txt'), win32)).toBe(true)
  })

  test('rejects traversal, sibling paths, the directory itself, and cross-drive paths', () => {
    const posixRoot = '/srv/localshare/uploads'
    expect(isPathWithin(posixRoot, '/srv/localshare/uploads', posix)).toBe(false)
    expect(isPathWithin(posixRoot, '/srv/localshare/uploads-evil/file.txt', posix)).toBe(false)
    expect(isPathWithin(posixRoot, '/srv/localshare/uploads/../file.txt', posix)).toBe(false)

    const windowsRoot = 'C:\\LocalShare\\uploads'
    expect(isPathWithin(windowsRoot, windowsRoot, win32)).toBe(false)
    expect(isPathWithin(windowsRoot, 'C:\\LocalShare\\uploads-evil\\file.txt', win32)).toBe(false)
    expect(isPathWithin(windowsRoot, 'C:\\LocalShare\\uploads\\..\\file.txt', win32)).toBe(false)
    expect(isPathWithin(windowsRoot, 'D:\\LocalShare\\uploads\\file.txt', win32)).toBe(false)
  })
})

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
    const sentMessage = (await sent.json()) as {
      id: string
      kind: string
      text: string
      attachment: { id: string; name: string }
    }
    expect(sentMessage).toMatchObject({
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

    const recalled = await app.request(`/api/v1/public/messages/${sentMessage.id}`, {
      method: 'DELETE',
      headers: { cookie: visitor.cookie },
    })
    expect(recalled.status).toBe(200)
    expect(await recalled.json()).toMatchObject({
      id: sentMessage.id,
      text: '',
      recalledAt: expect.any(String),
    })

    const hiddenAttachment = await app.request(attachment.url)
    expect(hiddenAttachment.status).toBe(404)
  })

  test('recalls messages only for their sender and hides recalled content', async () => {
    const owner = await bootstrapVisitor()
    const other = await bootstrapVisitor()
    const sent = await app.request('/api/v1/public/messages', {
      method: 'POST',
      headers: {
        cookie: owner.cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text: '这条消息将被撤回',
        clientRequestId: crypto.randomUUID(),
      }),
    })
    expect(sent.status).toBe(201)
    const message = (await sent.json()) as { id: string }

    const otherRecall = await app.request(`/api/v1/public/messages/${message.id}`, {
      method: 'DELETE',
      headers: { cookie: other.cookie },
    })
    expect(otherRecall.status).toBe(403)

    const ownRecall = await app.request(`/api/v1/public/messages/${message.id}`, {
      method: 'DELETE',
      headers: { cookie: owner.cookie },
    })
    expect(ownRecall.status).toBe(200)
    expect(await ownRecall.json()).toMatchObject({
      id: message.id,
      text: '',
      recalledAt: expect.any(String),
    })

    const repeatedRecall = await app.request(`/api/v1/public/messages/${message.id}`, {
      method: 'DELETE',
      headers: { cookie: owner.cookie },
    })
    expect(repeatedRecall.status).toBe(200)

    const history = await app.request('/api/v1/public/messages?limit=100', {
      headers: { cookie: other.cookie },
    })
    const historyBody = (await history.json()) as {
      messages: Array<{ id: string; text: string; recalledAt?: string }>
    }
    expect(historyBody.messages.find((candidate) => candidate.id === message.id)).toMatchObject({
      text: '',
      recalledAt: expect.any(String),
    })
  })

  test('searches text and attachment names in the database', async () => {
    const visitor = await bootstrapVisitor()
    const marker = `数据库搜索-${crypto.randomUUID()}`
    const sentText = await app.request('/api/v1/public/messages', {
      method: 'POST',
      headers: {
        cookie: visitor.cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text: marker,
        clientRequestId: crypto.randomUUID(),
      }),
    })
    expect(sentText.status).toBe(201)
    const textMessage = (await sentText.json()) as { id: string }

    const fileName = `搜索报告-${crypto.randomUUID()}.pdf`
    const uploaded = await app.request('/api/v1/public/uploads', {
      method: 'POST',
      headers: {
        cookie: visitor.cookie,
        'content-type': 'application/pdf',
        'x-file-name': encodeURIComponent(fileName),
      },
      body: 'search fixture',
    })
    expect(uploaded.status).toBe(201)
    const attachment = (await uploaded.json()) as { id: string }
    const sentFile = await app.request('/api/v1/public/messages', {
      method: 'POST',
      headers: {
        cookie: visitor.cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text: '',
        attachmentId: attachment.id,
        clientRequestId: crypto.randomUUID(),
      }),
    })
    expect(sentFile.status).toBe(201)

    const textSearch = await app.request(
      `/api/v1/public/search/messages?q=${encodeURIComponent(marker)}`,
    )
    expect(textSearch.status).toBe(200)
    expect(await textSearch.json()).toMatchObject({
      query: marker,
      messages: [{ id: textMessage.id, text: marker }],
    })

    const fileSearch = await app.request(
      `/api/v1/public/search/messages?q=${encodeURIComponent(fileName)}`,
    )
    expect(fileSearch.status).toBe(200)
    expect(await fileSearch.json()).toMatchObject({
      query: fileName,
      messages: [{ attachment: { name: fileName } }],
    })

    const recalled = await app.request(`/api/v1/public/messages/${textMessage.id}`, {
      method: 'DELETE',
      headers: { cookie: visitor.cookie },
    })
    expect(recalled.status).toBe(200)
    const hiddenSearch = await app.request(
      `/api/v1/public/search/messages?q=${encodeURIComponent(marker)}`,
    )
    expect(await hiddenSearch.json()).toEqual({ query: marker, messages: [] })

    const invalidSearch = await app.request('/api/v1/public/search/messages')
    expect(invalidSearch.status).toBe(400)
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
