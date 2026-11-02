import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const runtimeMeta = sqliteTable('runtime_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
})
