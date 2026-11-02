import {
  ADMIN_USERNAME,
  type AdminIdentity,
  type AdminSessionResponse,
} from '@localshare/contracts'
import { and, eq, gt, isNull } from 'drizzle-orm'

import type { DatabaseClient } from '../../db/client'
import { adminAccounts, adminSessions } from '../../db/schema'
import { HttpError } from '../../shared/http-error'

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1_000

export class AdminAuthError extends HttpError {
  constructor(code: string, status: 400 | 401 | 403 | 429, message: string) {
    super(code, status, message)
    this.name = 'AdminAuthError'
  }
}

function hashToken(token: string) {
  return new Bun.CryptoHasher('sha256').update(token).digest('hex')
}

function createSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Buffer.from(bytes).toString('base64url')
}

export class AdminAuthService {
  constructor(private readonly client: DatabaseClient) {}

  async login(password: string): Promise<{ session: AdminSessionResponse; token: string }> {
    const account = await this.client.db
      .select()
      .from(adminAccounts)
      .where(eq(adminAccounts.username, ADMIN_USERNAME))
      .limit(1)
      .then((rows) => rows[0])

    if (!account) {
      throw new AdminAuthError('ADMIN_INVALID_CREDENTIALS', 401, 'Invalid credentials')
    }

    const passwordMatches = await Bun.password.verify(password, account.passwordHash)
    if (!passwordMatches) {
      throw new AdminAuthError('ADMIN_INVALID_CREDENTIALS', 401, 'Invalid credentials')
    }

    const now = Date.now()
    const expiresAt = now + SESSION_DURATION_MS
    const token = createSessionToken()

    await this.client.db.insert(adminSessions).values({
      id: crypto.randomUUID(),
      accountId: account.id,
      tokenHash: hashToken(token),
      createdAt: now,
      lastUsedAt: now,
      expiresAt,
    })

    return {
      token,
      session: {
        admin: {
          id: account.id,
          username: ADMIN_USERNAME,
          mustChangePassword: account.mustChangePassword,
          sessionExpiresAt: new Date(expiresAt).toISOString(),
        },
      },
    }
  }

  async authenticate(token: string | undefined): Promise<AdminIdentity> {
    if (!token) {
      throw new AdminAuthError('ADMIN_UNAUTHORIZED', 401, 'Administrator login is required')
    }

    const now = Date.now()
    const row = await this.client.db
      .select({
        sessionId: adminSessions.id,
        expiresAt: adminSessions.expiresAt,
        accountId: adminAccounts.id,
        mustChangePassword: adminAccounts.mustChangePassword,
      })
      .from(adminSessions)
      .innerJoin(adminAccounts, eq(adminSessions.accountId, adminAccounts.id))
      .where(
        and(
          eq(adminSessions.tokenHash, hashToken(token)),
          isNull(adminSessions.revokedAt),
          gt(adminSessions.expiresAt, now),
          eq(adminAccounts.username, ADMIN_USERNAME),
        ),
      )
      .limit(1)
      .then((rows) => rows[0])

    if (!row) {
      throw new AdminAuthError('ADMIN_UNAUTHORIZED', 401, 'Administrator login is required')
    }

    await this.client.db
      .update(adminSessions)
      .set({ lastUsedAt: now })
      .where(eq(adminSessions.id, row.sessionId))

    return {
      id: row.accountId,
      username: ADMIN_USERNAME,
      mustChangePassword: row.mustChangePassword,
      sessionExpiresAt: new Date(row.expiresAt).toISOString(),
    }
  }

  async logout(token: string | undefined) {
    if (!token) return

    await this.client.db
      .update(adminSessions)
      .set({ revokedAt: Date.now() })
      .where(and(eq(adminSessions.tokenHash, hashToken(token)), isNull(adminSessions.revokedAt)))
  }

  async changePassword(token: string | undefined, currentPassword: string, newPassword: string) {
    const admin = await this.authenticate(token)
    const account = await this.client.db
      .select({ passwordHash: adminAccounts.passwordHash })
      .from(adminAccounts)
      .where(eq(adminAccounts.id, admin.id))
      .limit(1)
      .then((rows) => rows[0])

    if (!account || !(await Bun.password.verify(currentPassword, account.passwordHash))) {
      throw new AdminAuthError('ADMIN_PASSWORD_INVALID', 400, 'Current password is invalid')
    }

    if (currentPassword === newPassword) {
      throw new AdminAuthError(
        'ADMIN_PASSWORD_UNCHANGED',
        400,
        'New password must differ from the current password',
      )
    }

    const now = Date.now()
    const passwordHash = await Bun.password.hash(newPassword, { algorithm: 'argon2id' })

    await this.client.db.transaction(async (transaction) => {
      await transaction
        .update(adminAccounts)
        .set({
          passwordHash,
          mustChangePassword: false,
          updatedAt: now,
        })
        .where(eq(adminAccounts.id, admin.id))

      await transaction
        .update(adminSessions)
        .set({ revokedAt: now })
        .where(and(eq(adminSessions.accountId, admin.id), isNull(adminSessions.revokedAt)))
    })
  }
}
