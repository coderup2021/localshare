import { resolve } from 'node:path'

const root = new URL('..', import.meta.url).pathname
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
      child.process.kill(signal)
    }
  }
}

process.on('SIGINT', () => stopAll('SIGINT'))
process.on('SIGTERM', () => stopAll('SIGTERM'))

const exitCodes = await Promise.all(children.map((child) => child.process.exited))
stopAll()

const failed = exitCodes.find((code) => code !== 0)
process.exit(failed ?? 0)
