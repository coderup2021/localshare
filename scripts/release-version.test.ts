import { describe, expect, test } from 'bun:test'

import { defaultNextReleaseVersion, normalizeReleaseVersion } from './release-version'

describe('release versions', () => {
  test('normalizes an optional v prefix', () => {
    expect(normalizeReleaseVersion(' v0.2.1 ')).toBe('0.2.1')
  })

  test('increments the patch component by default', () => {
    expect(defaultNextReleaseVersion('0.2.0')).toBe('0.2.1')
    expect(defaultNextReleaseVersion('1.9.9')).toBe('1.9.10')
  })

  test('increments the last numeric prerelease component', () => {
    expect(defaultNextReleaseVersion('1.0.0-beta.9')).toBe('1.0.0-beta.10')
    expect(defaultNextReleaseVersion('1.0.0-beta-hotfix.2')).toBe('1.0.0-beta-hotfix.3')
    expect(defaultNextReleaseVersion('1.0.0-rc')).toBe('1.0.0-rc.1')
  })

  test('rejects invalid versions and build metadata', () => {
    expect(() => normalizeReleaseVersion('0.2')).toThrow()
    expect(() => normalizeReleaseVersion('0.2.1+build')).toThrow()
    expect(() => normalizeReleaseVersion('0.2.1-01')).toThrow()
  })
})
