import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const registry = 'https://registry.npmjs.org/'
const root = fileURLToPath(new URL('..', import.meta.url))
const manifestPath = join(root, '.release', 'npm', 'manifest.json')
const publishEnvPath = join(root, '.env.publish')

type ReleaseManifest = {
  version: string
  mainArtifact: string
  platforms: Array<{
    name: string
    artifact: string
  }>
  artifacts: string[]
}

export type StagedPackage = {
  packageName: string
  version: string
  shasum: string
  status: string
}

function readPublishToken() {
  const content = readFileSync(publishEnvPath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*NPM_ACCESS_TOKEN\s*=\s*(.*)\s*$/.exec(line)
    if (!match) continue

    const value = (match[1] ?? '').trim().replace(/^(['"])(.*)\1$/, '$2')
    if (value) return value
  }
  throw new Error('NPM_ACCESS_TOKEN is missing from .env.publish')
}

function npmEnvironment(token: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    npm_config_registry: registry,
    'npm_config_//registry.npmjs.org/:_authToken': token,
  }
  delete env.npm_config_otp
  return env
}

function run(command: string[], cwd = root, env: NodeJS.ProcessEnv = process.env) {
  const result = Bun.spawnSync(command, {
    cwd,
    env,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  if (result.exitCode !== 0) {
    throw new Error(`Command failed (${result.exitCode}): ${command.join(' ')}`)
  }
}

function capture(command: string[], env: NodeJS.ProcessEnv) {
  return Bun.spawnSync(command, {
    cwd: root,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  })
}

function listStagedPackages(packageName: string, env: NodeJS.ProcessEnv): StagedPackage[] {
  const result = capture(
    ['npm', 'stage', 'list', packageName, '--json', `--registry=${registry}`],
    env,
  )
  if (result.exitCode !== 0) {
    throw new Error(`Unable to list staged versions for ${packageName}`)
  }

  const output = result.stdout.toString().trim()
  if (!output) return []
  const parsed = JSON.parse(output) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error(`Unexpected staged package response for ${packageName}`)
  }
  return parsed as StagedPackage[]
}

export function findReusableStage(
  stages: StagedPackage[],
  packageName: string,
  version: string,
  expectedShasum: string,
) {
  const matching = stages.find(
    (stage) => stage.packageName === packageName && stage.version === version,
  )
  if (!matching) return undefined
  if (matching.shasum !== expectedShasum) {
    throw new Error(
      `${packageName}@${version} is already staged with shasum ${matching.shasum}, but the local artifact is ${expectedShasum}`,
    )
  }
  return matching
}

function sha1File(path: string) {
  return createHash('sha1').update(readFileSync(path)).digest('hex')
}

function stagePackage(
  packageName: string,
  packageDirectory: string,
  artifactPath: string,
  env: NodeJS.ProcessEnv,
) {
  const expectedShasum = sha1File(artifactPath)
  const reusableStage = findReusableStage(
    listStagedPackages(packageName, env),
    packageName,
    JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8')).version as string,
    expectedShasum,
  )
  if (reusableStage) {
    console.log(
      `Skipping ${packageName}@${reusableStage.version}; already staged with matching shasum`,
    )
    return
  }

  console.log('')
  console.log(`Staging ${packageName}`)
  run(['npm', 'stage', 'publish', '--tag=latest', `--registry=${registry}`], packageDirectory, env)
}

function printStageList(packageName: string, env: NodeJS.ProcessEnv) {
  const result = capture(
    ['npm', 'stage', 'list', packageName, '--json', `--registry=${registry}`],
    env,
  )
  if (result.exitCode === 0) {
    console.log(`Staged versions for ${packageName}:`)
    console.log(result.stdout.toString().trim())
  } else {
    console.log(`Inspect staged versions with: npm stage list ${packageName}`)
  }
}

function main() {
  const token = readPublishToken()
  const env = npmEnvironment(token)
  const stageHelp = capture(['npm', 'stage', '--help'], env)
  if (stageHelp.exitCode !== 0) {
    throw new Error('npm 11.21.1 or newer is required for staged publishing')
  }
  const whoami = capture(['npm', 'whoami', `--registry=${registry}`], env)
  if (whoami.exitCode !== 0) {
    throw new Error('NPM_ACCESS_TOKEN is invalid or does not have access to npm')
  }
  console.log(`Npm token account: ${whoami.stdout.toString().trim()}`)

  run(['bun', 'run', 'pack:server'])
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ReleaseManifest
  const releaseRoot = join(root, '.release', 'npm')
  const mainDirectory = join(releaseRoot, 'localshare-server')
  const artifactPath = (artifact: string) => join(releaseRoot, 'artifacts', artifact)

  for (const platform of manifest.platforms) {
    stagePackage(
      platform.name,
      join(releaseRoot, platform.name),
      artifactPath(platform.artifact),
      env,
    )
  }
  stagePackage('localshare-server', mainDirectory, artifactPath(manifest.mainArtifact), env)

  for (const platform of manifest.platforms) printStageList(platform.name, env)
  printStageList('localshare-server', env)

  console.log('')
  console.log(`LocalShare ${manifest.version} staged successfully.`)
  console.log('Review and approve the staged versions in the npm package web interface.')
}

if (import.meta.main) {
  try {
    main()
  } catch (error) {
    console.error(`publish-npm: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
