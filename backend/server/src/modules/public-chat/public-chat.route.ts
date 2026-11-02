import {
  createPublicMessageRequestSchema,
  publicAttachmentSchema,
  publicBootstrapResponseSchema,
  publicMessageListResponseSchema,
  publicMessageSchema,
} from '@localshare/contracts'
import { z } from 'zod'
import { getCookie, setCookie } from 'hono/cookie'
import { Hono } from 'hono'

import { HttpError } from '../../shared/http-error'
import type { RequestEnvironment } from '../../shared/types'
import type { PublicChatHub } from '../../realtime/public-chat-hub'
import { MAX_ATTACHMENT_BYTES, type AttachmentService } from './attachment.service'
import type { PublicChatService } from './public-chat.service'

export const VISITOR_COOKIE = 'localshare_visitor'
const VISITOR_COOKIE_SECONDS = 365 * 24 * 60 * 60

const messageQuerySchema = z.object({
  beforeSeq: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export function createPublicChatRoutes(
  service: PublicChatService,
  hub?: PublicChatHub,
  attachmentService?: AttachmentService,
) {
  const routes = new Hono<RequestEnvironment>()

  routes.use('*', async (context, next) => {
    context.header('cache-control', 'no-store')
    await next()
  })

  routes.get('/bootstrap', async (context) => {
    const existingVisitorId = getCookie(context, VISITOR_COOKIE)
    const response = await service.bootstrap(existingVisitorId)

    setCookie(context, VISITOR_COOKIE, response.visitor.id, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: VISITOR_COOKIE_SECONDS,
    })

    return context.json(publicBootstrapResponseSchema.parse(response))
  })

  routes.get('/messages', async (context) => {
    const parsed = messageQuerySchema.safeParse({
      beforeSeq: context.req.query('beforeSeq'),
      limit: context.req.query('limit'),
    })

    if (!parsed.success) {
      throw new HttpError('INVALID_REQUEST', 400, 'Invalid message query')
    }

    const response = await service.listMessages(parsed.data.beforeSeq, parsed.data.limit)
    return context.json(publicMessageListResponseSchema.parse(response))
  })

  routes.post('/uploads', async (context) => {
    if (!attachmentService) {
      throw new HttpError('ATTACHMENT_UNAVAILABLE', 503, 'Attachment service is unavailable')
    }

    const visitorId = getCookie(context, VISITOR_COOKIE)
    if (!visitorId) {
      throw new HttpError('VISITOR_REQUIRED', 401, 'Refresh the public channel before uploading')
    }

    const contentLength = Number(context.req.header('content-length') ?? '0')
    if (contentLength > MAX_ATTACHMENT_BYTES + 1024 * 1024) {
      throw new HttpError('ATTACHMENT_TOO_LARGE', 413, 'Attachment exceeds the 100 MB limit')
    }

    const body = context.req.raw.body
    if (!body) {
      throw new HttpError('ATTACHMENT_MISSING', 400, 'Upload file is required')
    }

    const encodedName = context.req.header('x-file-name')
    let name = 'attachment'
    try {
      if (encodedName) name = decodeURIComponent(encodedName)
    } catch {
      throw new HttpError('ATTACHMENT_NAME_INVALID', 400, 'Attachment name is invalid')
    }

    const attachment = await attachmentService.saveUpload(visitorId, {
      name,
      mimeType: context.req.header('content-type') ?? 'application/octet-stream',
      body,
    })
    return context.json(publicAttachmentSchema.parse(attachment), 201)
  })

  routes.get('/attachments/:id', async (context) => {
    if (!attachmentService) {
      throw new HttpError('ATTACHMENT_UNAVAILABLE', 503, 'Attachment service is unavailable')
    }

    const { row, path } = await attachmentService.attachedForDownload(context.req.param('id'))
    const file = Bun.file(path)
    const range = context.req.header('range')
    const disposition = row.kind === 'file' ? 'attachment' : 'inline'
    const encodedName = encodeURIComponent(row.originalName)
    const headers = new Headers({
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=3600',
      'content-type': row.mimeType,
      'content-disposition': `${disposition}; filename*=UTF-8''${encodedName}`,
      'x-content-type-options': 'nosniff',
    })

    if (!range) {
      headers.set('content-length', String(row.sizeBytes))
      return new Response(file.stream(), { headers })
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (!match) {
      throw new HttpError('RANGE_INVALID', 416, 'Invalid byte range')
    }

    const start = match[1] ? Number(match[1]) : 0
    const end = match[2] ? Number(match[2]) : row.sizeBytes - 1
    if (start > end || start >= row.sizeBytes || end >= row.sizeBytes) {
      headers.set('content-range', `bytes */${row.sizeBytes}`)
      throw new HttpError('RANGE_INVALID', 416, 'Invalid byte range')
    }

    headers.set('content-range', `bytes ${start}-${end}/${row.sizeBytes}`)
    headers.set('content-length', String(end - start + 1))
    return new Response(file.slice(start, end + 1).stream(), { status: 206, headers })
  })

  routes.post('/messages', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      throw new HttpError('INVALID_REQUEST', 400, 'Request body must be valid JSON')
    }

    const parsed = createPublicMessageRequestSchema.safeParse(body)
    if (!parsed.success) {
      throw new HttpError('INVALID_REQUEST', 400, 'Invalid message request')
    }

    const visitorId = getCookie(context, VISITOR_COOKIE)
    if (!visitorId) {
      throw new HttpError('VISITOR_REQUIRED', 401, 'Refresh the public channel before sending')
    }

    const result = await service.createMessage(visitorId, parsed.data)
    if (result.created) {
      hub?.publish(result.message)
    }
    return context.json(publicMessageSchema.parse(result.message), result.created ? 201 : 200)
  })

  return routes
}
