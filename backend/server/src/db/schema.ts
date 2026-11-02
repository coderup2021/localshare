import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const runtimeMeta = sqliteTable('runtime_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
})

export const adminAccounts = sqliteTable('admin_accounts', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  mustChangePassword: integer('must_change_password', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
})

export const adminSessions = sqliteTable('admin_sessions', {
  id: text('id').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => adminAccounts.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  lastUsedAt: integer('last_used_at', { mode: 'number' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'number' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'number' }),
})

export const anonymousVisitors = sqliteTable('anonymous_visitors', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  lastSeenAt: integer('last_seen_at', { mode: 'number' }).notNull(),
})

export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    nextSeq: integer('next_seq', { mode: 'number' }).notNull().default(1),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [uniqueIndex('conversations_slug_unique').on(table.slug)],
)

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  uploaderType: text('uploader_type').notNull(),
  uploaderId: text('uploader_id').notNull(),
  storageKey: text('storage_key').notNull().unique(),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes', { mode: 'number' }).notNull(),
  sha256: text('sha256').notNull(),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('pending'),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
})

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    seq: integer('seq', { mode: 'number' }).notNull(),
    senderType: text('sender_type').notNull(),
    senderId: text('sender_id').notNull(),
    senderName: text('sender_name').notNull(),
    kind: text('kind').notNull(),
    text: text('text').notNull(),
    clientRequestId: text('client_request_id').notNull(),
    attachmentId: text('attachment_id').references(() => attachments.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    deletedAt: integer('deleted_at', { mode: 'number' }),
  },
  (table) => [
    uniqueIndex('messages_conversation_seq_unique').on(table.conversationId, table.seq),
    uniqueIndex('messages_sender_request_unique').on(
      table.senderType,
      table.senderId,
      table.clientRequestId,
    ),
    index('messages_conversation_created_idx').on(table.conversationId, table.createdAt),
  ],
)
