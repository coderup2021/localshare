import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

type PlatformTarget = {
  platform: string
  arch: string
  label: string
  packageName: string
  bunTarget: string
  binaryName: string
}

const root = fileURLToPath(new URL('..', import.meta.url))
const releaseRoot = join(root, '.release', 'npm')
const artifactsDir = join(releaseRoot, 'artifacts')
const mainDir = join(releaseRoot, 'localshare-server')
const minimumBunVersion = '1.4.4'

if (Bun.semver.order(Bun.version, minimumBunVersion) < 0) {
  throw new Error(
    `Bun ${minimumBunVersion}+ is required to cross-compile Windows with a hidden console; current version: ${Bun.version}`,
  )
}

const serverPackage = JSON.parse(
  readFileSync(join(root, 'backend', 'server', 'package.json'), 'utf8'),
) as { version: string }
const version = serverPackage.version
const platformTargets = JSON.parse(
  readFileSync(join(root, 'backend', 'server', 'npm', 'bin', 'platforms.json'), 'utf8'),
) as PlatformTarget[]

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

const platformPacks: string[] = []
for (const target of platformTargets) {
  const platformDir = join(releaseRoot, target.packageName)
  const binaryPath = join(platformDir, 'bin', target.binaryName)
  mkdirSync(dirname(binaryPath), { recursive: true })

  const buildArgs = [
    'bun',
    'build',
    join(root, 'backend', 'server', 'src', 'index.ts'),
    '--compile',
    '--minify',
    `--target=${target.bunTarget}`,
    `--outfile=${binaryPath}`,
  ]
  if (target.platform === 'win32') {
    buildArgs.push('--windows-hide-console')
  }
  run(buildArgs)
  if (target.platform !== 'win32') chmodSync(binaryPath, 0o755)

  writeFileSync(
    join(platformDir, 'package.json'),
    `${JSON.stringify(
      {
        name: target.packageName,
        version,
        description: `LocalShare ${target.label} server runtime`,
        license: '0BSD',
        os: [target.platform],
        cpu: [target.arch],
        files: [`bin/${target.binaryName}`, 'LICENSE'],
      },
      null,
      2,
    )}\n`,
  )
  cpSync(join(root, 'LICENSE'), join(platformDir, 'LICENSE'))

  platformPacks.push(
    runCapture(['npm', 'pack', '--pack-destination', artifactsDir], platformDir).trim(),
  )
}

const mainPackage = JSON.parse(
  readFileSync(join(root, 'backend', 'server', 'npm', 'package.json'), 'utf8'),
) as { version: string; optionalDependencies?: Record<string, string> }
mainPackage.version = version
mainPackage.optionalDependencies = Object.fromEntries(
  platformTargets.map((target) => [target.packageName, version]),
)
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

const mainPack = runCapture(['npm', 'pack', '--pack-destination', artifactsDir], mainDir).trim()
const artifacts = [...platformPacks, mainPack]

writeFileSync(
  join(releaseRoot, 'manifest.json'),
  `${JSON.stringify(
    {
      version,
      mainArtifact: mainPack,
      platforms: platformTargets.map((target, index) => ({
        name: target.packageName,
        artifact: platformPacks[index],
      })),
      artifacts,
    },
    null,
    2,
  )}\n`,
)

for (const artifact of artifacts) {
  console.log(`Created ${join(artifactsDir, artifact)}`)
}
