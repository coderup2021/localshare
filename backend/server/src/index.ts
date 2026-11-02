import { createApp } from './app'
import { API_PORT, loadConfig } from './config/env'
import { initializeDatabase, isDatabaseReady } from './db/client'

const config = loadConfig()
const database = initializeDatabase(config.dataDir)
const app = createApp({
  isDatabaseReady: () => isDatabaseReady(database),
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
