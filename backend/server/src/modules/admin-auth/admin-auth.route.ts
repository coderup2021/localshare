import {
  adminLoginRequestSchema,
  adminOptionalSessionResponseSchema,
  adminPasswordChangeRequestSchema,
  adminPasswordChangeResponseSchema,
  adminSessionResponseSchema,
} from '@localshare/contracts'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { Hono, type Context } from 'hono'

import { HttpError } from '../../shared/http-error'
import type { RequestEnvironment } from '../../shared/types'
import { AdminAuthError, type AdminAuthService } from './admin-auth.service'

export const ADMIN_SESSION_COOKIE = 'localshare_admin_session'
const SESSION_SECONDS = 7 * 24 * 60 * 60
const LOGIN_ATTEMPT_LIMIT = 5
const LOGIN_WINDOW_MS = 15 * 60 * 1_000

type LoginAttempt = {
  failures: number
  resetAt: number
}

class LoginRateLimiter {
  private readonly attempts = new Map<string, LoginAttempt>()

  assertAllowed(key: string) {
    const attempt = this.attempts.get(key)
    if (!attempt) return

    if (attempt.resetAt <= Date.now()) {
      this.attempts.delete(key)
      return
    }

    if (attempt.failures >= LOGIN_ATTEMPT_LIMIT) {
      throw new HttpError('ADMIN_RATE_LIMITED', 429, 'Too many login attempts; try again later')
    }
  }

  recordFailure(key: string) {
    const now = Date.now()
    const existing = this.attempts.get(key)
    const attempt =
      existing && existing.resetAt > now
        ? { failures: existing.failures + 1, resetAt: existing.resetAt }
        : { failures: 1, resetAt: now + LOGIN_WINDOW_MS }

    this.attempts.set(key, attempt)
  }

  clear(key: string) {
    this.attempts.delete(key)
  }
}

function rejectCrossOrigin(context: Context<RequestEnvironment>) {
  const origin = context.req.header('origin')
  if (!origin) return

  try {
    const parsed = new URL(origin)
    const requestUrl = new URL(context.req.url)
    const requestHostname = context.req.header('host')?.split(':')[0] ?? requestUrl.hostname
    if (
      parsed.port === '7777' &&
      parsed.hostname === requestHostname &&
      (parsed.protocol === 'http:' || parsed.protocol === 'https:')
    ) {
      return
    }
  } catch {
    // Invalid origins are rejected below.
  }

  throw new HttpError('ADMIN_ORIGIN_REJECTED', 403, 'Request origin is not allowed')
}

function getSessionToken(context: Context<RequestEnvironment>) {
  return getCookie(context, ADMIN_SESSION_COOKIE)
}

function setSessionCookie(context: Context<RequestEnvironment>, token: string) {
  setCookie(context, ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_SECONDS,
  })
}

function clearSessionCookie(context: Context<RequestEnvironment>) {
  deleteCookie(context, ADMIN_SESSION_COOKIE, {
    path: '/',
  })
}

export function createAdminAuthRoutes(service: AdminAuthService) {
  const routes = new Hono<RequestEnvironment>()
  const limiter = new LoginRateLimiter()

  routes.use('*', async (context, next) => {
    if (context.req.method !== 'GET') {
      rejectCrossOrigin(context)
    }

    context.header('cache-control', 'no-store')
    await next()
  })

  routes.post('/login', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      throw new HttpError('INVALID_REQUEST', 400, 'Request body must be valid JSON')
    }

    const parsed = adminLoginRequestSchema.safeParse(body)
    if (!parsed.success) {
      throw new HttpError('INVALID_REQUEST', 400, 'Invalid login request')
    }

    const clientKey =
      context.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      context.req.header('x-real-ip') ??
      'local'

    limiter.assertAllowed(clientKey)

    try {
      const result = await service.login(parsed.data.password)
      limiter.clear(clientKey)
      setSessionCookie(context, result.token)
      return context.json(adminSessionResponseSchema.parse(result.session))
    } catch (error) {
      if (error instanceof AdminAuthError && error.code === 'ADMIN_INVALID_CREDENTIALS') {
        limiter.recordFailure(clientKey)
      }
      throw error
    }
  })

  routes.get('/me', async (context) => {
    const admin = await service.authenticate(getSessionToken(context))
    return context.json(adminSessionResponseSchema.parse({ admin }))
  })

  routes.get('/session', async (context) => {
    try {
      const admin = await service.authenticate(getSessionToken(context))
      return context.json(adminOptionalSessionResponseSchema.parse({ admin }))
    } catch (error) {
      if (error instanceof AdminAuthError && error.code === 'ADMIN_UNAUTHORIZED') {
        return context.json(adminOptionalSessionResponseSchema.parse({ admin: null }))
      }
      throw error
    }
  })

  routes.post('/logout', async (context) => {
    await service.logout(getSessionToken(context))
    clearSessionCookie(context)
    return context.body(null, 204)
  })

  routes.patch('/password', async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      throw new HttpError('INVALID_REQUEST', 400, 'Request body must be valid JSON')
    }

    const parsed = adminPasswordChangeRequestSchema.safeParse(body)
    if (!parsed.success) {
      throw new HttpError('INVALID_REQUEST', 400, 'Invalid password change request')
    }

    await service.changePassword(
      getSessionToken(context),
      parsed.data.currentPassword,
      parsed.data.newPassword,
    )
    clearSessionCookie(context)

    return context.json(adminPasswordChangeResponseSchema.parse({ requiresLogin: true }))
  })

  return routes
}
