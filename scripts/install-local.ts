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
import { basename, join } from 'node:path'
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
  artifacts: string[]
}
const installRoot = mkdtempSync(join(tmpdir(), 'localshare-local-install-'))
const prefix = join(installRoot, 'prefix')
const configDir = join(installRoot, 'config')
const wrapperDir = join(installRoot, 'bin')
const wrapperPath = join(wrapperDir, 'localshare')
const installedBinary = join(prefix, 'bin', 'localshare')
const artifacts = manifest.artifacts.map((artifact) =>
  join(root, '.release', 'npm', 'artifacts', basename(artifact)),
)

run(['npm', 'install', '--global', '--prefix', prefix, '--no-audit', '--no-fund', ...artifacts])

mkdirSync(wrapperDir, { recursive: true })
writeFileSync(
  wrapperPath,
  [
    '#!/bin/sh',
    `export LOCALSHARE_CONFIG_DIR="\${LOCALSHARE_CONFIG_DIR:-${configDir}}"`,
    `exec ${shellQuote(installedBinary)} "$@"`,
    '',
  ].join('\n'),
)
chmodSync(wrapperPath, 0o755)

if (existsSync(currentLink)) {
  const currentStat = lstatSync(currentLink)
  if (!currentStat.isSymbolicLink() && !currentStat.isFile()) {
    throw new Error(`Cannot replace non-file path: ${currentLink}`)
  }
  rmSync(currentLink, { force: true })
}
symlinkSync(installRoot, currentLink, 'dir')

console.log('')
console.log('Temporary LocalShare install is ready.')
console.log(`Install root: ${installRoot}`)
console.log(`Command:      ${wrapperPath}`)
console.log(`Stable path:  ${join(currentLink, 'bin', 'localshare')}`)
console.log('')
console.log(`Try: ${join(currentLink, 'bin', 'localshare')} start`)
