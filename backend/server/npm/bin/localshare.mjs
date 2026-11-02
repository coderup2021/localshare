#!/usr/bin/env node

import {
  accessSync,
  appendFileSync,
  closeSync,
  constants,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { networkInterfaces, homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { createInterface } from 'node:readline/promises'

const API_PORT = 8887
const WEB_PORT = 8888
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const require = createRequire(import.meta.url)
const configDir = process.env.LOCALSHARE_CONFIG_DIR ?? join(homedir(), '.localshare')
const currentInstanceFile = join(configDir, 'current.json')
const defaultDataDir = join(homedir(), '.localshare')

function fail(message) {
  throw new Error(message)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(temporary, path)
}

function instancePaths(dataDir) {
  const runDir = join(dataDir, 'run')
  return {
    dataDir,
    database: join(dataDir, 'localshare.sqlite'),
    uploads: join(dataDir, 'uploads'),
    logsDir: join(dataDir, 'logs'),
    log: join(dataDir, 'logs', 'localshare.log'),
    runDir,
    pid: join(runDir, 'localshare.pid'),
    lock: join(runDir, 'localshare.lock'),
    adminStatus: join(runDir, 'admin-status.json'),
  }
}

function localIPv4Addresses() {
  const addresses = []
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4') addresses.push(entry.address)
    }
  }
  return addresses
}

function validateIPv4(value) {
  if (value === '0.0.0.0') return

  const parts = value.split('.')
  const valid =
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255) &&
    value !== '255.255.255.255'
  if (!valid) fail(`Invalid IPv4 address: ${value}`)
  if (!localIPv4Addresses().includes(value)) {
    fail(`IPv4 address is not assigned to this machine: ${value}`)
  }
}

function probeHost(ip) {
  return ip === '0.0.0.0' ? '127.0.0.1' : ip
}

function displayHost(ip) {
  if (ip !== '0.0.0.0') return ip
  const lanAddress = localIPv4Addresses().find((address) => !address.startsWith('127.'))
  return lanAddress ?? '127.0.0.1'
}

function prepareDataDir(value) {
  const dataDir = resolve(value)
  mkdirSync(dataDir, { recursive: true })
  try {
    accessSync(dataDir, constants.R_OK | constants.W_OK)
  } catch {
    fail(`Data directory is not readable and writable: ${dataDir}`)
  }
  return dataDir
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function processMatches(pid) {
  if (!processAlive(pid)) return false
  if (process.platform !== 'linux') return true

  try {
    const command = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' ')
    return command.includes('localshare-server')
  } catch {
    return false
  }
}

function readCurrentInstance() {
  if (!existsSync(currentInstanceFile)) return null
  try {
    return readJson(currentInstanceFile)
  } catch {
    fail(`Instance pointer is invalid: ${currentInstanceFile}`)
  }
}

function readInstance(dataDir) {
  const file = join(dataDir, 'instance.json')
  if (!existsSync(file)) return null
  try {
    return readJson(file)
  } catch {
    fail(`Instance configuration is invalid: ${file}`)
  }
}

function cleanStaleRuntime(paths) {
  rmSync(paths.pid, { force: true })
  rmSync(paths.lock, { force: true })
}

async function checkPort(port, ip) {
  await new Promise((resolvePort, rejectPort) => {
    const server = createServer()
    server.once('error', (error) => {
      rejectPort(
        new Error(
          error.code === 'EADDRINUSE'
            ? `Port ${port} is already in use on ${ip}`
            : `Cannot bind port ${port} on ${ip}: ${error.message}`,
        ),
      )
    })
    server.once('listening', () => {
      server.close(() => resolvePort())
    })
    server.listen(port, ip)
  })
}

function binaryPath() {
  const platformPackage =
    process.platform === 'linux' && process.arch === 'x64' ? 'localshare-server-linux-x64' : null
  if (!platformPackage) {
    fail(`Unsupported platform: ${process.platform}-${process.arch}`)
  }

  let packageJsonPath
  try {
    packageJsonPath = require.resolve(`${platformPackage}/package.json`)
  } catch {
    fail(`Platform package ${platformPackage} is not installed`)
  }
  const path = join(dirname(packageJsonPath), 'bin', 'localshare-server')
  if (!existsSync(path)) fail(`LocalShare server binary is missing: ${path}`)
  return path
}

async function waitForHealth(instance, child, logPath) {
  const deadline = Date.now() + 20_000
  const host = probeHost(instance.ip)
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`LocalShare exited during startup. See log: ${logPath}`)
    }

    try {
      const api = await fetch(`http://${host}:${API_PORT}/api/v1/health/ready`, {
        signal: AbortSignal.timeout(1_500),
      })
      const web = await fetch(`http://${host}:${WEB_PORT}/`, {
        signal: AbortSignal.timeout(1_500),
      })
      if (api.ok && web.ok) return
    } catch {
      // The listeners are still starting.
    }
    await delay(250)
  }
  throw new Error(`LocalShare did not become healthy within 20 seconds. See log: ${logPath}`)
}

function printStarted(instance, adminStatus) {
  const host = displayHost(instance.ip)
  console.log('LocalShare started')
  console.log(`Web:   http://${host}:${WEB_PORT}/`)
  console.log(`Admin: http://${host}:${WEB_PORT}/admin/`)
  console.log(`API:   http://${host}:${API_PORT}/api/v1`)
  console.log(`Bind:  ${instance.ip}:${WEB_PORT} (Web), ${instance.ip}:${API_PORT} (API)`)
  console.log(`PID:   ${instance.pid}`)
  if (adminStatus?.mustChangePassword) {
    console.log(`Admin username: ${adminStatus.username}`)
    console.log('Admin password: 12345678')
    console.log('Change the default password after first login.')
  } else {
    console.log(`Admin username: ${adminStatus?.username ?? 'localShare'}`)
    console.log('Admin password: customized (not displayed)')
  }
}

async function start(dataDirValue, ip, options = {}) {
  const dataDir = prepareDataDir(dataDirValue)
  validateIPv4(ip)
  const paths = instancePaths(dataDir)
  const previous = readInstance(dataDir)

  if (previous && processMatches(previous.pid)) {
    fail(`LocalShare is already running (PID ${previous.pid}). Use status or restart.`)
  }

  cleanStaleRuntime(paths)
  await checkPort(API_PORT, ip)
  await checkPort(WEB_PORT, ip)
  mkdirSync(paths.runDir, { recursive: true })
  mkdirSync(paths.logsDir, { recursive: true })

  try {
    writeFileSync(paths.lock, JSON.stringify({ pid: process.pid, startedAt: Date.now() }), {
      flag: 'wx',
    })
  } catch {
    fail(`Another start operation is active for ${dataDir}`)
  }

  appendFileSync(paths.log, `\n[${new Date().toISOString()}] starting LocalShare\n`)
  const logFd = openSync(paths.log, 'a')
  let child
  try {
    child = spawn(binaryPath(), [], {
      detached: true,
      env: {
        ...process.env,
        API_HOST: ip,
        DATA_DIR: dataDir,
        LOCALSHARE_RUNTIME_MODE: 'production',
        LOCALSHARE_API_PORT: String(API_PORT),
        LOCALSHARE_WEB_PORT: String(WEB_PORT),
        LOCALSHARE_WEB_ROOT: join(ROOT, 'resources'),
        LOCALSHARE_MIGRATIONS_DIR: join(ROOT, 'resources', 'drizzle'),
        LOCALSHARE_ADMIN_STATUS_PATH: paths.adminStatus,
      },
      stdio: ['ignore', logFd, logFd],
    })
  } finally {
    closeSync(logFd)
  }
  if (!child.pid) {
    cleanStaleRuntime(paths)
    fail(`LocalShare failed to start. See log: ${paths.log}`)
  }
  child.unref()

  const instance = {
    pid: child.pid,
    version: packageJson.version,
    dataDir,
    ip,
    apiPort: API_PORT,
    webPort: WEB_PORT,
    startedAt: new Date().toISOString(),
  }
  writeJson(join(dataDir, 'instance.json'), instance)
  writeFileSync(paths.pid, String(instance.pid))

  try {
    await waitForHealth(instance, child, paths.log)
  } catch (error) {
    try {
      process.kill(instance.pid, 'SIGTERM')
    } catch {
      // Process already exited.
    }
    cleanStaleRuntime(paths)
    throw error
  }

  const adminStatus = existsSync(paths.adminStatus) ? readJson(paths.adminStatus) : null
  writeJson(currentInstanceFile, { dataDir })
  if (!options.quiet) printStarted(instance, adminStatus)
  return instance
}

async function waitForExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!processAlive(pid)) return true
    await delay(200)
  }
  return !processAlive(pid)
}

async function stop(options = {}) {
  const current = readCurrentInstance()
  if (!current) fail('No LocalShare instance is configured.')
  const instance = readInstance(current.dataDir)
  if (!instance) fail(`Instance configuration is missing in ${current.dataDir}`)
  const paths = instancePaths(instance.dataDir)

  if (!processAlive(instance.pid)) {
    cleanStaleRuntime(paths)
    if (!options.quiet) console.log('LocalShare is stopped.')
    return instance
  }
  if (!processMatches(instance.pid)) {
    fail(`PID ${instance.pid} no longer belongs to LocalShare; refusing to stop it.`)
  }

  process.kill(instance.pid, 'SIGTERM')
  if (!(await waitForExit(instance.pid, 10_000))) {
    process.kill(instance.pid, 'SIGKILL')
    await waitForExit(instance.pid, 3_000)
  }
  cleanStaleRuntime(paths)
  if (!options.quiet) console.log(`LocalShare stopped (PID ${instance.pid}).`)
  return instance
}

async function startCommand(args) {
  const options = parseStartOptions(args)
  const current = readCurrentInstance()
  const saved = current ? readInstance(current.dataDir) : null

  if (saved && processMatches(saved.pid)) {
    if (options.reset) {
      fail('LocalShare is running. Use "localshare restart --reset" to reconfigure it.')
    }
    fail(`LocalShare is already running (PID ${saved.pid}). Use status or restart.`)
  }

  const config = await resolveStartConfiguration(options)
  await start(config.dataDir, config.ip)
}

async function restartCommand(args) {
  const options = parseStartOptions(args)
  const current = readCurrentInstance()
  const saved = current ? readInstance(current.dataDir) : null

  if (!options.reset) {
    if (options.dataDir || options.ip) {
      fail('Use "start --data-dir ... --ip ..." to choose a new configuration.')
    }
    if (!saved) fail('No LocalShare instance is configured. Use localshare start.')

    if (processMatches(saved.pid)) await stop({ quiet: true })
    await start(saved.dataDir, saved.ip)
    return
  }

  if (saved && processMatches(saved.pid)) await stop({ quiet: true })
  const config = await resolveStartConfiguration({ ...options, reset: true })
  await start(config.dataDir, config.ip)
}

async function status() {
  const current = readCurrentInstance()
  if (!current) {
    console.log('LocalShare is not configured.')
    process.exitCode = 1
    return
  }
  const instance = readInstance(current.dataDir)
  if (!instance) {
    console.log(`LocalShare state is invalid: ${current.dataDir}`)
    process.exitCode = 2
    return
  }

  if (!processMatches(instance.pid)) {
    cleanStaleRuntime(instancePaths(instance.dataDir))
    console.log('LocalShare is stopped (stale runtime state cleaned).')
    process.exitCode = 3
    return
  }

  let health = 'unreachable'
  const host = displayHost(instance.ip)
  try {
    const response = await fetch(
      `http://${probeHost(instance.ip)}:${API_PORT}/api/v1/health/ready`,
      {
        signal: AbortSignal.timeout(2_000),
      },
    )
    health = response.ok ? 'ready' : `error ${response.status}`
  } catch {
    // Keep "unreachable" for diagnostics.
  }

  console.log('LocalShare is running')
  console.log(`PID:    ${instance.pid}`)
  console.log(`Status: ${health}`)
  console.log(`Version: ${instance.version}`)
  console.log(`Data:   ${instance.dataDir}`)
  console.log(`IP:     ${instance.ip}`)
  console.log(`Web:    http://${host}:${WEB_PORT}/`)
  console.log(`Admin:  http://${host}:${WEB_PORT}/admin/`)
  console.log(`API:    http://${host}:${API_PORT}/api/v1`)
}

function logs() {
  const current = readCurrentInstance()
  if (!current) fail('No LocalShare instance is configured.')
  const paths = instancePaths(current.dataDir)
  if (!existsSync(paths.log)) {
    console.log(`No log file found at ${paths.log}`)
    return
  }
  const lines = readFileSync(paths.log, 'utf8').trimEnd().split('\n').slice(-50)
  console.log(lines.join('\n'))
}

function parseStartOptions(args) {
  const options = { reset: false }
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (key === '--reset') {
      options.reset = true
      continue
    }
    if (key !== '--data-dir' && key !== '--ip') fail(`Unknown option: ${key}`)

    const value = args[index + 1]
    if (!value) fail(`Missing value for ${key}`)
    options[key === '--data-dir' ? 'dataDir' : 'ip'] = value
    index += 1
  }
  return options
}

async function readlineQuestion(question) {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  try {
    return await readline.question(question)
  } finally {
    readline.close()
  }
}

async function promptStartConfiguration(defaults) {
  if (!process.stdin.isTTY) {
    validateIPv4(defaults.ip)
    return defaults
  }

  const dataDirAnswer = (await readlineQuestion(`Data directory [${defaults.dataDir}]: `)).trim()
  const dataDir = dataDirAnswer || defaults.dataDir

  let ip
  while (true) {
    const ipAnswer = (await readlineQuestion(`Listen IPv4 [${defaults.ip}]: `)).trim()
    ip = ipAnswer || defaults.ip
    try {
      validateIPv4(ip)
      break
    } catch (error) {
      console.error(error.message)
    }
  }

  return { dataDir, ip }
}

async function resolveStartConfiguration(options) {
  const current = readCurrentInstance()
  const saved = current ? readInstance(current.dataDir) : null

  if (!options.reset && !options.dataDir && !options.ip && saved) {
    return { dataDir: saved.dataDir, ip: saved.ip }
  }

  const defaults = {
    dataDir: options.dataDir ?? saved?.dataDir ?? defaultDataDir,
    ip: options.ip ?? saved?.ip ?? '0.0.0.0',
  }
  if (options.dataDir && options.ip) {
    validateIPv4(defaults.ip)
    return defaults
  }

  return promptStartConfiguration(defaults)
}

function help() {
  console.log(`LocalShare ${packageJson.version}

Usage:
  localshare start [--data-dir <directory>] [--ip <IPv4>] [--reset]
  localshare stop
  localshare restart [--reset]
  localshare status
  localshare logs
  localshare --version

Defaults:
  data directory: ${defaultDataDir}
  listen IPv4:    0.0.0.0 (all IPv4 interfaces)`)
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (!command || command === '--help' || command === '-h') {
    help()
    return
  }
  if (command === '--version' || command === '-v') {
    console.log(packageJson.version)
    return
  }
  if (command === 'start') {
    await startCommand(args)
    return
  }
  if (command === 'stop') return stop()
  if (command === 'restart') return restartCommand(args)
  if (command === 'status') return status()
  if (command === 'logs') return logs()
  fail(`Unknown command: ${command}`)
}

main().catch((error) => {
  console.error(`localshare: ${error.message}`)
  process.exitCode = 1
})
