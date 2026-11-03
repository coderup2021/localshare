import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const currentRoot = join(tmpdir(), 'localshare-local-current')
const isWindows = process.platform === 'win32'
const wrapperPath = join(currentRoot, 'bin', isWindows ? 'localshare.cmd' : 'localshare')
const cliPath = [
  join(currentRoot, 'prefix', 'node_modules', 'localshare-server', 'bin', 'localshare.mjs'),
  join(currentRoot, 'prefix', 'lib', 'node_modules', 'localshare-server', 'bin', 'localshare.mjs'),
].find(existsSync)
const node = Bun.which('node')

if (!existsSync(wrapperPath)) {
  throw new Error(`Installed wrapper is missing: ${wrapperPath}. Run install:local first.`)
}
if (!cliPath) {
  throw new Error(`Installed CLI is missing under ${currentRoot}. Run install:local first.`)
}
const installedCliPath = cliPath
if (!node) {
  throw new Error('Node.js is required to verify the published npm CLI')
}
const nodePath = node

const configDir = mkdtempSync(join(tmpdir(), 'localshare-verify-config-'))
const dataDir = mkdtempSync(join(tmpdir(), 'localshare-verify-data-'))
const environment = {
  ...process.env,
  LOCALSHARE_CONFIG_DIR: configDir,
}

function runCli(args: string[], allowFailure = false) {
  const result = Bun.spawnSync([nodePath, installedCliPath, ...args], {
    cwd: currentRoot,
    env: environment,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const stdout = result.stdout.toString()
  const stderr = result.stderr.toString()
  if (!allowFailure && result.exitCode !== 0) {
    throw new Error(`localshare ${args.join(' ')} failed (${result.exitCode}): ${stderr || stdout}`)
  }
  return { result, stdout, stderr }
}

async function assertReady() {
  for (const path of ['/api/v1/health/ready', '/', '/admin/']) {
    const port = path.startsWith('/api/') ? 8887 : 8888
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      signal: AbortSignal.timeout(3_000),
    })
    if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`)
  }
}

try {
  const version = runCli(['--version']).stdout.trim()
  if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(version)) {
    throw new Error(`Unexpected localshare version output: ${version}`)
  }

  const started = runCli(['start', '--data-dir', dataDir, '--ip', '0.0.0.0'])
  if (!started.stdout.includes('Web:') || !started.stdout.includes('Admin:')) {
    throw new Error('start output did not include Web and Admin addresses')
  }
  await assertReady()
  runCli(['status'])

  runCli(['restart'])
  await assertReady()
  const log = readFileSync(join(dataDir, 'logs', 'localshare.log'), 'utf8')
  if (!log.includes('Received control, shutting down')) {
    throw new Error('restart did not use the authenticated graceful shutdown control')
  }
  runCli(['stop'])

  const stopped = runCli(['status'], true)
  if (stopped.result.exitCode !== 3) {
    throw new Error(`Expected stopped status exit code 3, got ${stopped.result.exitCode}`)
  }

  console.log(
    `Native npm install lifecycle passed for ${process.platform}-${process.arch} (${version}).`,
  )
} finally {
  runCli(['stop'], true)
  rmSync(configDir, { recursive: true, force: true })
  rmSync(dataDir, { recursive: true, force: true })
}
