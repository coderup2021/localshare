import { createApp } from './app'
import { API_PORT, loadConfig } from './config/env'
import { ensureDefaultAdmin, ensurePublicConversation } from './db/bootstrap'
import { initializeDatabase, isDatabaseReady } from './db/client'
import { AdminAuthService } from './modules/admin-auth/admin-auth.service'
import { PublicChatService } from './modules/public-chat/public-chat.service'

const config = loadConfig()
const database = initializeDatabase(config.dataDir)
await ensureDefaultAdmin(database)
await ensurePublicConversation(database)
const adminAuth = new AdminAuthService(database)
const publicChat = new PublicChatService(database)
const app = createApp({
  isDatabaseReady: () => isDatabaseReady(database),
  adminAuth,
  publicChat,
})

const server = Bun.serve({
  hostname: config.apiHost,
  port: API_PORT,
  fetch: app.fetch,
})

console.log(`LocalShare API listening on http://${config.apiHost}:${API_PORT}`)
console.log(`Data directory: ${config.dataDir}`)

function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down`)
  server.stop()
  database.sqlite.close()
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
