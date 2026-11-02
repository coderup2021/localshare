import { loadConfig } from '../config/env'
import { ensureDefaultAdmin } from './bootstrap'
import { initializeDatabase, isDatabaseReady } from './client'

const config = loadConfig()
const client = initializeDatabase(config.dataDir)

if (!isDatabaseReady(client)) {
  throw new Error('Database readiness check failed after migration')
}

await ensureDefaultAdmin(client)
client.sqlite.close()
console.log(`Database migrated successfully in ${config.dataDir}`)
