import { describe, expect, test } from 'bun:test'
import { posix, win32 } from 'node:path'

import { isPathWithin } from './path'

describe('cross-platform path containment', () => {
  test('accepts managed files on POSIX and Windows', () => {
    const posixRoot = '/srv/localshare/uploads'
    expect(isPathWithin(posixRoot, posix.join(posixRoot, 'file.txt'), posix)).toBe(true)

    const windowsRoot = 'C:\\LocalShare\\uploads'
    expect(isPathWithin(windowsRoot, win32.join(windowsRoot, 'file.txt'), win32)).toBe(true)
  })

  test('rejects traversal, sibling paths, the directory itself, and cross-drive paths', () => {
    const posixRoot = '/srv/localshare/uploads'
    expect(isPathWithin(posixRoot, '/srv/localshare/uploads', posix)).toBe(false)
    expect(isPathWithin(posixRoot, '/srv/localshare/uploads-evil/file.txt', posix)).toBe(false)
    expect(isPathWithin(posixRoot, '/srv/localshare/uploads/../file.txt', posix)).toBe(false)

    const windowsRoot = 'C:\\LocalShare\\uploads'
    expect(isPathWithin(windowsRoot, windowsRoot, win32)).toBe(false)
    expect(isPathWithin(windowsRoot, 'C:\\LocalShare\\uploads-evil\\file.txt', win32)).toBe(false)
    expect(isPathWithin(windowsRoot, 'C:\\LocalShare\\uploads\\..\\file.txt', win32)).toBe(false)
    expect(isPathWithin(windowsRoot, 'D:\\LocalShare\\uploads\\file.txt', win32)).toBe(false)
  })
})
