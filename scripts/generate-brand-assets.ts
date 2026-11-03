import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const sourceSvg = join(root, 'assets', 'brand', 'localshare-icon.svg')
const desktopAssets = join(root, 'app-desktop', 'assets')
const iconSet = join(desktopAssets, 'icon.iconset')
const temporaryRoot = mkdtempSync(join(tmpdir(), 'localshare-brand-'))
const masterPng = join(temporaryRoot, 'localshare-icon.png')

function run(command: string[]) {
  const result = spawnSync(command[0] ?? '', command.slice(1), {
    cwd: root,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status ?? 'signal'}): ${command.join(' ')}`)
  }
}

function resize(size: number, output: string) {
  run(['sips', '-z', String(size), String(size), masterPng, '--out', output])
}

function pngDimensions(path: string) {
  const bytes = readFileSync(path)
  const signature = bytes.subarray(0, 8).toString('hex')
  if (signature !== '89504e470d0a1a0a') {
    throw new Error(`${path} is not a PNG image`)
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  }
}

function createIco(output: string, sizes: number[]) {
  const images = sizes.map((size) => {
    const path = join(temporaryRoot, `icon-${size}.png`)
    resize(size, path)
    return { size, path, data: readFileSync(path) }
  })
  const headerSize = 6 + images.length * 16
  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  let imageOffset = headerSize
  images.forEach(({ size, data }, index) => {
    const entryOffset = 6 + index * 16
    header.writeUInt8(size === 256 ? 0 : size, entryOffset)
    header.writeUInt8(size === 256 ? 0 : size, entryOffset + 1)
    header.writeUInt8(0, entryOffset + 2)
    header.writeUInt8(0, entryOffset + 3)
    header.writeUInt16LE(1, entryOffset + 4)
    header.writeUInt16LE(32, entryOffset + 6)
    header.writeUInt32LE(data.length, entryOffset + 8)
    header.writeUInt32LE(imageOffset, entryOffset + 12)
    imageOffset += data.length
  })

  writeFileSync(output, Buffer.concat([header, ...images.map(({ data }) => data)]))
}

try {
  if (process.platform !== 'darwin') {
    throw new Error('Brand asset generation currently requires macOS and the sips command')
  }

  mkdirSync(desktopAssets, { recursive: true })
  mkdirSync(join(root, 'app-desktop', 'src', 'mainview', 'public'), { recursive: true })
  cpSync(sourceSvg, join(root, 'backend', 'web-user', 'public', 'favicon.svg'))
  cpSync(sourceSvg, join(root, 'backend', 'web-admin', 'public', 'favicon.svg'))
  cpSync(sourceSvg, join(root, 'app-desktop', 'assets', 'icon.svg'))
  cpSync(sourceSvg, join(root, 'app-desktop', 'src', 'mainview', 'public', 'brand-icon.svg'))

  run(['sips', '-s', 'format', 'png', sourceSvg, '--out', masterPng])
  const dimensions = pngDimensions(masterPng)
  if (dimensions.width !== 1024 || dimensions.height !== 1024) {
    throw new Error(`Expected a 1024x1024 PNG, received ${dimensions.width}x${dimensions.height}`)
  }

  cpSync(masterPng, join(desktopAssets, 'icon.png'))
  rmSync(iconSet, { recursive: true, force: true })
  mkdirSync(iconSet, { recursive: true })
  for (const [name, size] of [
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
  ] as const) {
    resize(size, join(iconSet, name))
  }
  createIco(join(desktopAssets, 'icon.ico'), [16, 24, 32, 48, 64, 128, 256])
  console.log('LocalShare brand assets generated.')
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
