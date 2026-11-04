import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const desktopRoot = join(root, 'app-desktop')
const channel = 'canary'
const appIdentifier = 'dev.localshare.desktop'
const appDisplayName = 'LocalShare Desktop'
const appBundleName = `${appDisplayName}-${channel}.app`
const appFileName = `LocalShareDesktop-${channel}`
const hostPlatform =
  process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux'
const platformPrefix = `${channel}-${hostPlatform}-${process.arch}`

function run(command: string[], cwd = root) {
  const result = spawnSync(command[0] ?? '', command.slice(1), {
    cwd,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status ?? 'signal'}): ${command.join(' ')}`)
  }
}

function signMacApp(appPath: string) {
  run([
    '/usr/bin/codesign',
    '--force',
    '--deep',
    '--sign',
    '-',
    '--identifier',
    appIdentifier,
    appPath,
  ])
  run(['/usr/bin/codesign', '--verify', '--deep', '--strict', '--verbose=4', appPath])
}

function createMacArtifacts(appPath: string) {
  const buildDir = join(desktopRoot, 'build', platformPrefix)
  const artifactsDir = join(desktopRoot, 'artifacts')
  const dmgPath = join(artifactsDir, `${platformPrefix}-${appFileName}.dmg`)
  const archivePath = join(artifactsDir, `${platformPrefix}-${appFileName}.app.tar.zst`)
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'localshare-macos-package-'))

  try {
    const dmgRoot = join(temporaryRoot, 'dmg')
    mkdirSync(artifactsDir, { recursive: true })
    mkdirSync(dmgRoot, { recursive: true })
    run(['/usr/bin/ditto', appPath, join(dmgRoot, appBundleName)])
    symlinkSync('/Applications', join(dmgRoot, 'Applications'))

    rmSync(dmgPath, { force: true })
    run([
      '/usr/bin/hdiutil',
      'create',
      '-volname',
      appFileName,
      '-srcfolder',
      dmgRoot,
      '-format',
      'ULFO',
      '-ov',
      dmgPath,
    ])
    run(['/usr/bin/hdiutil', 'verify', dmgPath])

    const updateTar = join(temporaryRoot, `${appFileName}.tar`)
    run(['/usr/bin/tar', '-cf', updateTar, appBundleName], buildDir)
    rmSync(archivePath, { force: true })
    run(['zstd', '-q', '-f', '-o', archivePath, updateTar])

    console.log('')
    console.log('macOS arm64 package ready:')
    for (const path of [dmgPath, archivePath]) {
      console.log(`  ${path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path}`)
    }
    console.log(`  signature: ad-hoc (${basename(appPath)})`)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

run(['bun', 'run', 'prepare:electrobun'], desktopRoot)
run(['bun', 'run', 'build:view'], desktopRoot)
run(['bunx', 'electrobun', 'build', `--env=${channel}`], desktopRoot)

if (process.platform === 'darwin') {
  const appPath = join(desktopRoot, 'build', platformPrefix, appBundleName)
  if (!existsSync(appPath)) {
    throw new Error(`Expected macOS app bundle was not created: ${appPath}`)
  }
  signMacApp(appPath)
  createMacArtifacts(appPath)
}
