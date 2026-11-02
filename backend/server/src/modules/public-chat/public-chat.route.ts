import {
  createPublicMessageRequestSchema,
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
import type { PublicChatService } from './public-chat.service'

export const VISITOR_COOKIE = 'localshare_visitor'
const VISITOR_COOKIE_SECONDS = 365 * 24 * 60 * 60

const messageQuerySchema = z.object({
  beforeSeq: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export function createPublicChatRoutes(service: PublicChatService, hub?: PublicChatHub) {
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
