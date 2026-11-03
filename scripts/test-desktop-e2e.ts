import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dataDir = fileURLToPath(new URL('../.desktop-e2e-data', import.meta.url))
const userDataDir = fileURLToPath(new URL('../.desktop-e2e-data/user', import.meta.url))
const markerPath = fileURLToPath(new URL('../.desktop-e2e-data/desktop.jsonl', import.meta.url))
const discoveryPort = '49778'
const bun = Bun.which('bun') ?? process.execPath

rmSync(dataDir, { recursive: true, force: true })
mkdirSync(userDataDir, { recursive: true })

const environment = {
  ...process.env,
  DATA_DIR: dataDir,
  LOCALSHARE_DISCOVERY_PORT: discoveryPort,
  LOCALSHARE_VERSION: '0.2.0',
  LOCALSHARE_DESKTOP_USER_DATA: userDataDir,
  LOCALSHARE_DESKTOP_TEST_OUTPUT: markerPath,
}

const detached = process.platform !== 'win32'
let serverOutput = ''
let desktopOutput = ''

const server = Bun.spawn([bun, 'run', 'dev'], {
  cwd: root,
  env: environment,
  stdin: 'ignore',
  stdout: 'pipe',
  stderr: 'pipe',
  detached,
})

const collect = async (stream: ReadableStream<Uint8Array>, append: (text: string) => void) => {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) return
    append(decoder.decode(value, { stream: true }))
  }
}

const serverLogs = [
  collect(server.stdout, (text) => {
    serverOutput += text
    process.stdout.write(text)
  }),
  collect(server.stderr, (text) => {
    serverOutput += text
    process.stderr.write(text)
  }),
]

function stopProcess(child: ReturnType<typeof Bun.spawn>) {
  if (child.exitCode !== null) return
  try {
    if (process.platform === 'win32') {
      Bun.spawnSync(['taskkill', '/PID', String(child.pid), '/T', '/F'])
    } else {
      process.kill(-child.pid, 'SIGTERM')
    }
  } catch {
    child.kill()
  }
}

async function waitUntil<T>(
  read: () => T | null | Promise<T | null>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await read()
    if (value !== null) return value
    await Bun.sleep(250)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

let desktop: ReturnType<typeof Bun.spawn> | null = null
const desktopLogs: Promise<void>[] = []

try {
  await waitUntil(
    async () => {
      try {
        const response = await fetch('http://127.0.0.1:7777/api/v1/health/ready', {
          signal: AbortSignal.timeout(1_000),
        })
        return response.ok ? true : null
      } catch {
        return null
      }
    },
    120_000,
    'the LocalShare development entry',
  )

  const command =
    process.platform === 'linux' && !process.env.DISPLAY
      ? ['xvfb-run', '-a', bun, 'run', '--cwd', 'app-desktop', 'dev']
      : [bun, 'run', '--cwd', 'app-desktop', 'dev']

  desktop = Bun.spawn(command, {
    cwd: root,
    env: environment,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    detached,
  })
  if (
    !desktop.stdout ||
    typeof desktop.stdout === 'number' ||
    !desktop.stderr ||
    typeof desktop.stderr === 'number'
  ) {
    throw new Error('Desktop process did not expose piped logs')
  }
  desktopLogs.push(
    collect(desktop.stdout, (text) => {
      desktopOutput += text
      process.stdout.write(text)
    }),
    collect(desktop.stderr, (text) => {
      desktopOutput += text
      process.stderr.write(text)
    }),
  )

  await waitUntil(
    () => {
      if (desktop?.exitCode !== null && desktop?.exitCode !== undefined) {
        throw new Error(`Desktop process exited before opening a server (${desktop.exitCode})`)
      }
      if (!existsSync(markerPath)) return null
      const phases = readFileSync(markerPath, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { phase?: string })
      return phases.some((phase) => phase.phase === 'server-ready') ? phases : null
    },
    180_000,
    'the desktop WebView to open the discovered server',
  )

  await waitUntil(
    () => (serverOutput.includes('GET /api/v1/public/bootstrap 200') ? true : null),
    30_000,
    'the desktop WebView to bootstrap the public chat',
  )

  if (/error boundary|uncaught|fatal/i.test(desktopOutput)) {
    throw new Error('Desktop process reported a fatal error')
  }

  console.log('Desktop E2E passed: UDP discovery opened the real user-web chat.')
} finally {
  if (desktop) stopProcess(desktop)
  stopProcess(server)
  await Promise.race([Promise.all([...serverLogs, ...desktopLogs]), Bun.sleep(5_000)])
}
