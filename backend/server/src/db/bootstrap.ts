import { ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD } from '@localshare/contracts'
import { eq } from 'drizzle-orm'

import { adminAccounts } from './schema'
import type { DatabaseClient } from './client'

export async function ensureDefaultAdmin(client: DatabaseClient) {
  const existing = await client.db
    .select({ id: adminAccounts.id })
    .from(adminAccounts)
    .where(eq(adminAccounts.username, ADMIN_USERNAME))
    .limit(1)

  if (existing.length > 0) return

  const now = Date.now()
  const passwordHash = await Bun.password.hash(DEFAULT_ADMIN_PASSWORD, {
    algorithm: 'argon2id',
  })

  await client.db
    .insert(adminAccounts)
    .values({
      id: crypto.randomUUID(),
      username: ADMIN_USERNAME,
      passwordHash,
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
}
