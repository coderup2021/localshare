import { loadConfig } from '../config/env'
import { initializeDatabase, isDatabaseReady } from './client'

const config = loadConfig()
const client = initializeDatabase(config.dataDir)

if (!isDatabaseReady(client)) {
  throw new Error('Database readiness check failed after migration')
}

client.sqlite.close()
console.log(`Database migrated successfully in ${config.dataDir}`)
