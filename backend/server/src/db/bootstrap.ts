import {
  ADMIN_USERNAME,
  DEFAULT_ADMIN_PASSWORD,
  PUBLIC_CONVERSATION_SLUG,
} from '@localshare/contracts'
import { eq } from 'drizzle-orm'

import { adminAccounts, conversations } from './schema'
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

export async function ensurePublicConversation(client: DatabaseClient) {
  const existing = await client.db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.slug, PUBLIC_CONVERSATION_SLUG))
    .limit(1)

  if (existing.length > 0) return

  const now = Date.now()
  await client.db
    .insert(conversations)
    .values({
      id: crypto.randomUUID(),
      slug: PUBLIC_CONVERSATION_SLUG,
      type: 'public',
      title: '公共频道',
      nextSeq: 1,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
}
