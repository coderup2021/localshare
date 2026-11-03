import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const bun = Bun.which('bun') ?? process.execPath

const applications = [
  { name: 'server', cwd: 'backend/server' },
  { name: 'admin-web', cwd: 'backend/web-admin' },
  { name: 'user-web', cwd: 'backend/web-user' },
] as const

const children = applications.map((application) => ({
  name: application.name,
  process: Bun.spawn([bun, 'run', '--cwd', resolve(root, application.cwd), 'dev'], {
    cwd: root,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  }),
}))

let stopping = false

function stopAll(signal: NodeJS.Signals = 'SIGTERM') {
  if (stopping) return
  stopping = true

  for (const child of children) {
    if (child.process.exitCode === null) {
      if (process.platform === 'win32') {
        Bun.spawnSync(['taskkill', '/PID', String(child.process.pid), '/T', '/F'], {
          stdout: 'ignore',
          stderr: 'ignore',
        })
      } else {
        child.process.kill(signal)
      }
    }
  }
}

process.on('SIGINT', () => stopAll('SIGINT'))
process.on('SIGTERM', () => stopAll('SIGTERM'))
if (process.platform === 'win32') {
  process.on('SIGBREAK', () => stopAll('SIGTERM'))
}

const exitCodes = await Promise.all(children.map((child) => child.process.exited))
stopAll()

const failed = exitCodes.find((code) => code !== 0)
process.exit(failed ?? 0)
