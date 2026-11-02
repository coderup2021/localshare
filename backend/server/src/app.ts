import { apiErrorSchema, healthStatusSchema } from '@localshare/contracts'
import { Hono } from 'hono'

type AppDependencies = {
  isDatabaseReady: () => boolean
}

type AppEnvironment = {
  Variables: {
    requestId: string
  }
}

export function createApp(dependencies: AppDependencies) {
  const app = new Hono<AppEnvironment>()

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
    console.error(error)
    const body = apiErrorSchema.parse({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId: context.get('requestId') ?? crypto.randomUUID(),
      },
    })

    return context.json(body, 500)
  })

  return app
}
