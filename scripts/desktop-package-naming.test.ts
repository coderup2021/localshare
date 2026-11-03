import { describe, expect, test } from 'bun:test'

import { desktopBundleFolderName } from './desktop-package-naming'

describe('desktop Windows package naming', () => {
  test('uses the unsuffixed bundle folder for stable builds', () => {
    expect(desktopBundleFolderName('Task Timer', 'stable')).toBe('TaskTimer')
  })

  test('matches Electrobun installer folder naming for canary builds', () => {
    expect(desktopBundleFolderName('LocalShare Desktop', 'canary')).toBe('LocalShareDesktop-canary')
  })

  test('matches Electrobun installer folder naming for development builds', () => {
    expect(desktopBundleFolderName('LocalShare Desktop', 'dev')).toBe('LocalShareDesktop-dev')
  })
})
