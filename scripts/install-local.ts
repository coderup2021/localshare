import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifestPath = join(root, '.release', 'npm', 'manifest.json')
const currentLink = join(tmpdir(), 'localshare-local-current')

function run(command: string[], cwd = root) {
  const result = Bun.spawnSync(command, {
    cwd,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  if (result.exitCode !== 0) {
    throw new Error(`Command failed (${result.exitCode}): ${command.join(' ')}`)
  }
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

run(['bun', 'run', 'pack:server'])

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  mainArtifact: string
  platforms: Array<{ name: string; artifact: string }>
}
const platformTargets = JSON.parse(
  readFileSync(join(root, 'backend', 'server', 'npm', 'bin', 'platforms.json'), 'utf8'),
) as Array<{ platform: string; arch: string; packageName: string }>
const currentPlatform = platformTargets.find(
  (target) => target.platform === process.platform && target.arch === process.arch,
)
if (!currentPlatform) {
  throw new Error(`Unsupported platform for local install: ${process.platform}-${process.arch}`)
}
const platformPackage = manifest.platforms.find(
  (platform) => platform.name === currentPlatform.packageName,
)
if (!platformPackage) {
  throw new Error(`Missing local artifact for ${currentPlatform.packageName}`)
}
const installRoot = mkdtempSync(join(tmpdir(), 'localshare-local-install-'))
const prefix = join(installRoot, 'prefix')
const configDir = join(installRoot, 'config')
const wrapperDir = join(installRoot, 'bin')
const isWindows = process.platform === 'win32'
const wrapperName = isWindows ? 'localshare.cmd' : 'localshare'
const wrapperPath = join(wrapperDir, wrapperName)
const artifacts = [platformPackage.artifact, manifest.mainArtifact].map((artifact) =>
  join(root, '.release', 'npm', 'artifacts', artifact),
)

run(['npm', 'install', '--global', '--prefix', prefix, '--no-audit', '--no-fund', ...artifacts])

mkdirSync(wrapperDir, { recursive: true })
const installedCommand = [
  join(prefix, isWindows ? 'localshare.cmd' : 'bin/localshare'),
  join(prefix, 'bin', wrapperName),
].find(existsSync)
if (!installedCommand) {
  throw new Error(`npm did not create the localshare command under ${prefix}`)
}

if (isWindows) {
  writeFileSync(
    wrapperPath,
    [
      '@echo off',
      `if not defined LOCALSHARE_CONFIG_DIR set "LOCALSHARE_CONFIG_DIR=${configDir}"`,
      `call "${installedCommand}" %*`,
      '',
    ].join('\r\n'),
  )
} else {
  writeFileSync(
    wrapperPath,
    [
      '#!/bin/sh',
      `export LOCALSHARE_CONFIG_DIR="\${LOCALSHARE_CONFIG_DIR:-${configDir}}"`,
      `exec ${shellQuote(installedCommand)} "$@"`,
      '',
    ].join('\n'),
  )
  chmodSync(wrapperPath, 0o755)
}

if (existsSync(currentLink)) {
  const currentStat = lstatSync(currentLink)
  if (!currentStat.isSymbolicLink() && !currentStat.isFile()) {
    throw new Error(`Cannot replace non-file path: ${currentLink}`)
  }
  rmSync(currentLink, { force: true, recursive: true })
}
symlinkSync(installRoot, currentLink, isWindows ? 'junction' : 'dir')

console.log('')
console.log('Temporary LocalShare install is ready.')
console.log(`Install root: ${installRoot}`)
console.log(`Command:      ${wrapperPath}`)
console.log(`Stable path:  ${join(currentLink, 'bin', wrapperName)}`)
console.log('')
console.log(`Try: ${join(currentLink, 'bin', wrapperName)} start`)
