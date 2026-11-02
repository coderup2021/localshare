import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

export const API_PORT = 5678 as const
const defaultDataDir = fileURLToPath(new URL('../../../../.data', import.meta.url))

const environmentSchema = z.object({
  API_HOST: z.string().min(1).default('127.0.0.1'),
  DATA_DIR: z.string().min(1).default(defaultDataDir),
})

export type AppConfig = {
  apiHost: string
  dataDir: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.parse(env)

  return {
    apiHost: parsed.API_HOST,
    dataDir: resolve(parsed.DATA_DIR),
  }
}
