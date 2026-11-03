import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const sourceSvg = readFileSync(join(root, 'assets', 'brand', 'localshare-icon.svg'))

describe('brand assets', () => {
  test('derives every web and desktop SVG from the canonical source', () => {
    for (const path of [
      'backend/web-user/public/favicon.svg',
      'backend/web-admin/public/favicon.svg',
      'app-desktop/assets/icon.svg',
      'app-desktop/src/mainview/public/brand-icon.svg',
    ]) {
      expect(readFileSync(join(root, path))).toEqual(sourceSvg)
    }
  })

  test('packages a multi-size Windows icon', () => {
    const icon = readFileSync(join(root, 'app-desktop', 'assets', 'icon.ico'))
    expect(icon.readUInt16LE(0)).toBe(0)
    expect(icon.readUInt16LE(2)).toBe(1)

    const count = icon.readUInt16LE(4)
    const sizes = Array.from({ length: count }, (_, index) => {
      const width = icon.readUInt8(6 + index * 16)
      return width === 0 ? 256 : width
    })
    expect(sizes).toEqual([16, 24, 32, 48, 64, 128, 256])
  })

  test('packages the complete macOS iconset', () => {
    const iconset = join(root, 'app-desktop', 'assets', 'icon.iconset')
    const expected = new Map([
      ['icon_16x16.png', 16],
      ['icon_16x16@2x.png', 32],
      ['icon_32x32.png', 32],
      ['icon_32x32@2x.png', 64],
      ['icon_128x128.png', 128],
      ['icon_128x128@2x.png', 256],
      ['icon_256x256.png', 256],
      ['icon_256x256@2x.png', 512],
      ['icon_512x512.png', 512],
      ['icon_512x512@2x.png', 1024],
    ])

    for (const [name, size] of expected) {
      const png = readFileSync(join(iconset, name))
      expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
      expect(png.readUInt32BE(16)).toBe(size)
      expect(png.readUInt32BE(20)).toBe(size)
    }
  })
})
