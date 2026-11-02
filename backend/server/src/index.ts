import { createApp } from './app'
import { API_PORT, loadConfig } from './config/env'
import { ensureDefaultAdmin, ensurePublicConversation } from './db/bootstrap'
import { initializeDatabase, isDatabaseReady } from './db/client'
import { AdminAuthService } from './modules/admin-auth/admin-auth.service'
import { PublicChatService } from './modules/public-chat/public-chat.service'
import { AttachmentService } from './modules/public-chat/attachment.service'
import { PublicChatHub } from './realtime/public-chat-hub'
import { websocket } from 'hono/bun'

const config = loadConfig()
const database = initializeDatabase(config.dataDir)
await ensureDefaultAdmin(database)
await ensurePublicConversation(database)
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
})

const server = Bun.serve({
  hostname: config.apiHost,
  port: API_PORT,
  fetch: app.fetch,
  websocket,
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
