import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const registry = 'https://registry.npmjs.org/'
const root = fileURLToPath(new URL('..', import.meta.url))
const manifestPath = join(root, '.release', 'npm', 'manifest.json')
const publishEnvPath = join(root, '.env.publish')

type ReleaseManifest = {
  version: string
  platform: string
  artifacts: string[]
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

function stagePackage(packageName: string, packageDirectory: string, env: NodeJS.ProcessEnv) {
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
  const whoami = capture(['npm', 'whoami', `--registry=${registry}`], env)
  if (whoami.exitCode !== 0) {
    throw new Error('NPM_ACCESS_TOKEN is invalid or does not have access to npm')
  }
  console.log(`Npm token account: ${whoami.stdout.toString().trim()}`)

  run(['bun', 'run', 'pack:server'])
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ReleaseManifest
  const releaseRoot = join(root, '.release', 'npm')
  const platformDirectory = join(releaseRoot, manifest.platform)
  const mainDirectory = join(releaseRoot, 'localshare-server')

  stagePackage(manifest.platform, platformDirectory, env)
  stagePackage('localshare-server', mainDirectory, env)

  printStageList(manifest.platform, env)
  printStageList('localshare-server', env)

  console.log('')
  console.log(`LocalShare ${manifest.version} staged successfully.`)
  console.log('Review and approve the staged versions in the npm package web interface.')
}

try {
  main()
} catch (error) {
  console.error(`publish-npm: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
