import { timingSafeEqual } from 'node:crypto'
import { apiErrorSchema, healthStatusSchema } from '@localshare/contracts'
import { Hono } from 'hono'
import { upgradeWebSocket } from 'hono/bun'

import { createAdminAuthRoutes } from './modules/admin-auth/admin-auth.route'
import type { AdminAuthService } from './modules/admin-auth/admin-auth.service'
import { createPublicChatRoutes } from './modules/public-chat/public-chat.route'
import type { PublicChatService } from './modules/public-chat/public-chat.service'
import type { AttachmentService } from './modules/public-chat/attachment.service'
import type { PublicChatHub } from './realtime/public-chat-hub'
import { HttpError } from './shared/http-error'
import type { RequestEnvironment } from './shared/types'

type AppDependencies = {
  isDatabaseReady: () => boolean
  adminAuth?: AdminAuthService
  publicChat?: PublicChatService
  publicChatHub?: PublicChatHub
  attachments?: AttachmentService
  controlToken?: string
  requestShutdown?: () => void
}

function controlTokensMatch(expected: string, provided: string | undefined) {
  if (!provided) return false
  const expectedBytes = Buffer.from(expected)
  const providedBytes = Buffer.from(provided)
  return (
    expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes)
  )
}

export function createApp(dependencies: AppDependencies) {
  const app = new Hono<RequestEnvironment>()

  app.use('/api/*', async (context, next) => {
    const requestId = context.req.header('x-request-id') ?? crypto.randomUUID()
    context.set('requestId', requestId)
    context.header('x-request-id', requestId)

    const startedAt = performance.now()
    await next()

    console.info(
      `${context.req.method} ${context.req.path} ${context.res.status} ${Math.round(
        performance.now() - startedAt,
      )}ms requestId=${requestId}`,
    )
  })

  app.get('/api/v1/health/live', (context) => {
    const body = healthStatusSchema.parse({
      status: 'ok',
      service: 'localshare-server',
      timestamp: new Date().toISOString(),
    })

    return context.json(body)
  })

  app.get('/api/v1/health/ready', (context) => {
    const databaseReady = dependencies.isDatabaseReady()
    const body = healthStatusSchema.parse({
      status: databaseReady ? 'ok' : 'degraded',
      service: 'localshare-server',
      timestamp: new Date().toISOString(),
      checks: {
        database: databaseReady ? 'up' : 'down',
      },
    })

    return context.json(body, databaseReady ? 200 : 503)
  })

  if (dependencies.adminAuth) {
    app.route('/api/v1/admin/auth', createAdminAuthRoutes(dependencies.adminAuth))
  }

  if (dependencies.publicChat) {
    app.route(
      '/api/v1/public',
      createPublicChatRoutes(
        dependencies.publicChat,
        dependencies.publicChatHub,
        dependencies.attachments,
      ),
    )
  }

  if (dependencies.publicChatHub) {
    const hub = dependencies.publicChatHub
    app.get(
      '/ws',
      upgradeWebSocket(() => {
        let unsubscribe = () => {}

        return {
          onOpen(_event, socket) {
            unsubscribe = hub.subscribe((event) => {
              socket.send(JSON.stringify(event))
            })
            socket.send(JSON.stringify(hub.ready(0)))
          },
          onClose() {
            unsubscribe()
          },
          onError() {
            unsubscribe()
          },
        }
      }),
    )
  }

  const controlToken = dependencies.controlToken
  const requestShutdown = dependencies.requestShutdown
  if (controlToken && requestShutdown) {
    app.post('/api/v1/control/shutdown', (context) => {
      if (!controlTokensMatch(controlToken, context.req.header('x-localshare-control-token'))) {
        throw new HttpError('CONTROL_FORBIDDEN', 403, 'Invalid control token')
      }

      setTimeout(requestShutdown, 25)
      return context.body(null, 202)
    })
  }

  app.notFound((context) => {
    const body = apiErrorSchema.parse({
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
        requestId: context.get('requestId') ?? crypto.randomUUID(),
      },
    })

    return context.json(body, 404)
  })

  app.onError((error, context) => {
    const requestId = context.get('requestId') ?? crypto.randomUUID()

    if (error instanceof HttpError) {
      const body = apiErrorSchema.parse({
        error: {
          code: error.code,
          message: error.message,
          requestId,
        },
      })

      return context.json(body, error.status)
    }

    console.error(error)
    const body = apiErrorSchema.parse({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId,
      },
    })

    return context.json(body, 500)
  })

  return app
}
