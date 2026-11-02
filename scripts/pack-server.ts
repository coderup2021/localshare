import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const releaseRoot = join(root, '.release', 'npm')
const artifactsDir = join(releaseRoot, 'artifacts')
const mainDir = join(releaseRoot, 'localshare-server')
const platformName = 'localshare-server-linux-x64'
const platformDir = join(releaseRoot, platformName)
const binaryName = 'localshare-server'
const binaryPath = join(platformDir, 'bin', binaryName)
const serverPackage = JSON.parse(
  readFileSync(join(root, 'backend', 'server', 'package.json'), 'utf8'),
)
const version = serverPackage.version

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

function runCapture(command: string[], cwd = root) {
  const result = Bun.spawnSync(command, {
    cwd,
    stdout: 'pipe',
    stderr: 'inherit',
  })
  if (result.exitCode !== 0) {
    throw new Error(`Command failed (${result.exitCode}): ${command.join(' ')}`)
  }
  return result.stdout.toString()
}

rmSync(releaseRoot, { recursive: true, force: true })
mkdirSync(artifactsDir, { recursive: true })

run(['bun', 'run', 'build'], join(root, 'backend', 'web-user'))
run(['bun', 'run', 'build'], join(root, 'backend', 'web-admin'))

mkdirSync(dirname(binaryPath), { recursive: true })
run([
  'bun',
  'build',
  join(root, 'backend', 'server', 'src', 'index.ts'),
  '--compile',
  '--minify',
  `--outfile=${binaryPath}`,
])
chmodSync(binaryPath, 0o755)

const mainPackage = JSON.parse(
  readFileSync(join(root, 'backend', 'server', 'npm', 'package.json'), 'utf8'),
)
mainPackage.version = version
mainPackage.optionalDependencies = {
  [platformName]: version,
}
mkdirSync(join(mainDir, 'bin'), { recursive: true })
cpSync(join(root, 'backend', 'server', 'npm', 'bin'), join(mainDir, 'bin'), {
  recursive: true,
})
cpSync(join(root, 'backend', 'server', 'npm', 'README.md'), join(mainDir, 'README.md'))
cpSync(join(root, 'LICENSE'), join(mainDir, 'LICENSE'))
writeFileSync(join(mainDir, 'package.json'), `${JSON.stringify(mainPackage, null, 2)}\n`)
chmodSync(join(mainDir, 'bin', 'localshare.mjs'), 0o755)

mkdirSync(join(mainDir, 'resources'), { recursive: true })
cpSync(join(root, 'backend', 'web-user', 'dist'), join(mainDir, 'resources', 'web-user'), {
  recursive: true,
})
cpSync(join(root, 'backend', 'web-admin', 'dist'), join(mainDir, 'resources', 'web-admin'), {
  recursive: true,
})
cpSync(join(root, 'backend', 'server', 'drizzle'), join(mainDir, 'resources', 'drizzle'), {
  recursive: true,
})

writeFileSync(
  join(platformDir, 'package.json'),
  `${JSON.stringify(
    {
      name: platformName,
      version,
      description: 'LocalShare Linux x64 server runtime',
      license: '0BSD',
      os: ['linux'],
      cpu: ['x64'],
      files: ['bin/localshare-server', 'LICENSE'],
    },
    null,
    2,
  )}\n`,
)
cpSync(join(root, 'LICENSE'), join(platformDir, 'LICENSE'))

const platformPack = runCapture(
  ['npm', 'pack', '--pack-destination', artifactsDir],
  platformDir,
).trim()
const mainPack = runCapture(['npm', 'pack', '--pack-destination', artifactsDir], mainDir).trim()

writeFileSync(
  join(releaseRoot, 'manifest.json'),
  `${JSON.stringify(
    {
      version,
      platform: platformName,
      artifacts: [platformPack, mainPack],
    },
    null,
    2,
  )}\n`,
)

console.log(`Created ${join(artifactsDir, platformPack)}`)
console.log(`Created ${join(artifactsDir, mainPack)}`)
