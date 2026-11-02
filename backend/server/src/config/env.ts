import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

export const DEVELOPMENT_API_PORT = 5678 as const
export const DEVELOPMENT_WEB_PORT = 7777 as const
export const PRODUCTION_API_PORT = 8887 as const
export const PRODUCTION_WEB_PORT = 8888 as const
const defaultDataDir = fileURLToPath(new URL('../../../../.data', import.meta.url))
const defaultMigrationsDir = fileURLToPath(new URL('../../drizzle', import.meta.url))

const environmentSchema = z.object({
  API_HOST: z.string().min(1).default('0.0.0.0'),
  DATA_DIR: z.string().min(1).default(defaultDataDir),
  LOCALSHARE_RUNTIME_MODE: z.enum(['development', 'production']).default('development'),
  LOCALSHARE_API_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  LOCALSHARE_WEB_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  LOCALSHARE_WEB_ROOT: z.string().min(1).optional(),
  LOCALSHARE_MIGRATIONS_DIR: z.string().min(1).optional(),
  LOCALSHARE_ADMIN_STATUS_PATH: z.string().min(1).optional(),
})

export type AppConfig = {
  apiHost: string
  apiPort: number
  dataDir: string
  mode: 'development' | 'production'
  migrationsDir: string
  webPort: number
  webRoot?: string
  adminStatusPath?: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.parse(env)
  const production = parsed.LOCALSHARE_RUNTIME_MODE === 'production'
  const defaultApiPort = production ? PRODUCTION_API_PORT : DEVELOPMENT_API_PORT
  const defaultWebPort = production ? PRODUCTION_WEB_PORT : DEVELOPMENT_WEB_PORT

  return {
    apiHost: parsed.API_HOST,
    apiPort: parsed.LOCALSHARE_API_PORT ?? defaultApiPort,
    dataDir: resolve(parsed.DATA_DIR),
    mode: parsed.LOCALSHARE_RUNTIME_MODE,
    migrationsDir: resolve(parsed.LOCALSHARE_MIGRATIONS_DIR ?? defaultMigrationsDir),
    webPort: parsed.LOCALSHARE_WEB_PORT ?? defaultWebPort,
    ...(parsed.LOCALSHARE_WEB_ROOT ? { webRoot: resolve(parsed.LOCALSHARE_WEB_ROOT) } : {}),
    ...(parsed.LOCALSHARE_ADMIN_STATUS_PATH
      ? { adminStatusPath: resolve(parsed.LOCALSHARE_ADMIN_STATUS_PATH) }
      : {}),
  }
}
