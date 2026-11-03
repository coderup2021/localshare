import { describe, expect, test } from 'bun:test'
import { DISCOVERY_PORT } from '@localshare/contracts'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { loadConfig } from './env'

describe('server configuration', () => {
  test('uses the bundled migrations by default in development', () => {
    const config = loadConfig({})

    expect(config.mode).toBe('development')
    expect(config.apiPort).toBe(5678)
    expect(config.webPort).toBe(7777)
    expect(config.discoveryEnabled).toBe(true)
    expect(config.discoveryPort).toBe(DISCOVERY_PORT)
    expect(config.serverVersion).toBe('dev')
    expect(existsSync(join(config.migrationsDir, 'meta', '_journal.json'))).toBe(true)
  })

  test('uses production ports and explicit packaged resources', () => {
    const config = loadConfig({
      LOCALSHARE_RUNTIME_MODE: 'production',
      LOCALSHARE_WEB_ROOT: '/opt/localshare/resources',
      LOCALSHARE_MIGRATIONS_DIR: '/opt/localshare/resources/drizzle',
    })

    expect(config.apiPort).toBe(8887)
    expect(config.webPort).toBe(8888)
    expect(config.webRoot).toBe('/opt/localshare/resources')
    expect(config.migrationsDir).toBe('/opt/localshare/resources/drizzle')
  })

  test('allows tests and manual deployments to override discovery', () => {
    const config = loadConfig({
      LOCALSHARE_DISCOVERY_ENABLED: 'false',
      LOCALSHARE_DISCOVERY_PORT: '49888',
      LOCALSHARE_VERSION: '0.2.0',
    })

    expect(config.discoveryEnabled).toBe(false)
    expect(config.discoveryPort).toBe(49_888)
    expect(config.serverVersion).toBe('0.2.0')
  })
})
