import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ADMIN_USERNAME } from '@localshare/contracts'
import { createApp } from './app'
import { loadConfig } from './config/env'
import { ensureDefaultAdmin, ensurePublicConversation } from './db/bootstrap'
import { initializeDatabase, isDatabaseReady } from './db/client'
import { adminAccounts } from './db/schema'
import { startLanDiscovery, type LanDiscovery } from './discovery/lan-discovery'
import { AdminAuthService } from './modules/admin-auth/admin-auth.service'
import { PublicChatService } from './modules/public-chat/public-chat.service'
import { AttachmentService } from './modules/public-chat/attachment.service'
import { PublicChatHub } from './realtime/public-chat-hub'
import { createWebHandler } from './web/static-server'
import { websocket } from 'hono/bun'
import { eq } from 'drizzle-orm'

const config = loadConfig()
const database = initializeDatabase(config.dataDir, config.migrationsDir)
await ensureDefaultAdmin(database)
await ensurePublicConversation(database)

if (config.adminStatusPath) {
  const admin = await database.db
    .select({ mustChangePassword: adminAccounts.mustChangePassword })
    .from(adminAccounts)
    .where(eq(adminAccounts.username, ADMIN_USERNAME))
    .limit(1)
    .then((rows) => rows[0])

  mkdirSync(dirname(config.adminStatusPath), { recursive: true })
  writeFileSync(
    config.adminStatusPath,
    JSON.stringify({
      username: ADMIN_USERNAME,
      mustChangePassword: admin?.mustChangePassword ?? true,
    }),
  )
}

const adminAuth = new AdminAuthService(database)
const attachments = new AttachmentService(database, config.dataDir)
const publicChat = new PublicChatService(database, attachments)
const publicChatHub = new PublicChatHub()
const app = createApp({
  isDatabaseReady: () => isDatabaseReady(database),
  adminAuth,
  publicChat,
  publicChatHub,
  attachments,
  ...(config.controlToken ? { controlToken: config.controlToken } : {}),
  requestShutdown: () => void shutdown('control'),
})

const apiServer = Bun.serve({
  hostname: config.apiHost,
  port: config.apiPort,
  fetch: app.fetch,
  websocket,
})

let webServer: ReturnType<typeof Bun.serve> | undefined
let lanDiscovery: LanDiscovery | undefined

if (config.mode === 'production') {
  if (!config.webRoot) {
    throw new Error('LOCALSHARE_WEB_ROOT is required in production mode')
  }

  const webHandler = createWebHandler({
    app,
    userRoot: join(config.webRoot, 'web-user'),
    adminRoot: join(config.webRoot, 'web-admin'),
  })
  webServer = Bun.serve({
    hostname: config.apiHost,
    port: config.webPort,
    fetch: webHandler,
    websocket,
  })
}

if (config.discoveryEnabled) {
  try {
    lanDiscovery = await startLanDiscovery({
      dataDir: config.dataDir,
      host: config.apiHost,
      port: config.discoveryPort,
      webPort: config.webPort,
      serverVersion: config.serverVersion,
    })
  } catch (error) {
    webServer?.stop()
    apiServer.stop()
    database.sqlite.close()
    throw new Error(
      `Could not start LocalShare UDP discovery on ${config.apiHost}:${config.discoveryPort}`,
      {
        cause: error,
      },
    )
  }
}

console.log(`LocalShare API listening on http://${config.apiHost}:${config.apiPort}`)
if (webServer) {
  console.log(`LocalShare Web listening on http://${config.apiHost}:${config.webPort}`)
}
if (lanDiscovery) {
  console.log(
    `LocalShare discovery listening on udp://${config.apiHost}:${lanDiscovery.address.port}`,
  )
}
console.log(`Data directory: ${config.dataDir}`)

let shuttingDown = false

async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`Received ${signal}, shutting down`)
  webServer?.stop()
  apiServer.stop()
  await lanDiscovery?.close()
  database.sqlite.close()
  process.exit(0)
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal))
}
if (process.platform === 'win32') {
  process.on('SIGBREAK', () => void shutdown('SIGBREAK'))
}
