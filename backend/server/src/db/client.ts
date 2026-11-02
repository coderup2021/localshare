import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

import * as schema from './schema'

export type DatabaseClient = {
  sqlite: Database
  db: BunSQLiteDatabase<typeof schema>
}

export function openDatabase(dataDir: string): DatabaseClient {
  mkdirSync(dataDir, { recursive: true })

  const sqlite = new Database(join(dataDir, 'localshare.sqlite'), { create: true })
  sqlite.exec('PRAGMA journal_mode = WAL;')
  sqlite.exec('PRAGMA foreign_keys = ON;')
  sqlite.exec('PRAGMA busy_timeout = 5000;')

  return {
    sqlite,
    db: drizzle(sqlite, { schema }),
  }
}

export function initializeDatabase(dataDir: string): DatabaseClient {
  const client = openDatabase(dataDir)
  const migrationsFolder = new URL('../../drizzle', import.meta.url).pathname

  migrate(client.db, { migrationsFolder })
  return client
}

export function isDatabaseReady(client: DatabaseClient): boolean {
  const row = client.sqlite.query('SELECT 1 AS ready').get() as { ready: number } | null
  return row?.ready === 1
}
