import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { findPlatformTarget, PLATFORM_TARGETS, supportedPlatformLabels } from './bin/platforms.mjs'

const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
)

describe('published platform matrix', () => {
  test('covers Linux, Windows and macOS', () => {
    expect(PLATFORM_TARGETS.map((target) => `${target.platform}-${target.arch}`)).toEqual([
      'linux-x64',
      'linux-arm64',
      'win32-x64',
      'darwin-x64',
      'darwin-arm64',
    ])
    expect(supportedPlatformLabels()).toContain('Windows x64')
  })

  test('selects the binary and npm package for each supported runtime', () => {
    expect(findPlatformTarget('win32', 'x64')).toMatchObject({
      packageName: 'localshare-server-win32-x64',
      bunTarget: 'bun-windows-x64',
      binaryName: 'localshare-server.exe',
    })
    expect(findPlatformTarget('darwin', 'arm64')).toMatchObject({
      packageName: 'localshare-server-darwin-arm64',
      bunTarget: 'bun-darwin-arm64',
      binaryName: 'localshare-server',
    })
    expect(findPlatformTarget('linux', 'x64')).toMatchObject({
      packageName: 'localshare-server-linux-x64',
      binaryName: 'localshare-server',
    })
    expect(findPlatformTarget('freebsd', 'x64')).toBeUndefined()
  })

  test('declares every runtime package as an optional dependency', () => {
    expect(packageJson.optionalDependencies).toEqual(
      Object.fromEntries(
        PLATFORM_TARGETS.map((target) => [target.packageName, packageJson.version]),
      ),
    )
  })
})
