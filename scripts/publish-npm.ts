import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const registry = 'https://registry.npmjs.org/'
const root = fileURLToPath(new URL('..', import.meta.url))
const manifestPath = join(root, '.release', 'npm', 'manifest.json')
const artifactsDir = join(root, '.release', 'npm', 'artifacts')

type ReleaseManifest = {
  version: string
  platform: string
  artifacts: string[]
}

function run(command: string[], env: NodeJS.ProcessEnv = process.env) {
  const result = Bun.spawnSync(command, {
    cwd: root,
    env,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  if (result.exitCode !== 0) {
    throw new Error(`Command failed (${result.exitCode}): ${command.join(' ')}`)
  }
}

function capture(command: string[]) {
  return Bun.spawnSync(command, {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  })
}

function registryHasVersion(packageName: string, version: string) {
  const result = capture([
    'npm',
    'view',
    `${packageName}@${version}`,
    'version',
    '--json',
    `--registry=${registry}`,
  ])
  return result.exitCode === 0
}

async function promptOtp(packageName: string, version: string) {
  if (!process.stdin.isTTY) {
    throw new Error('OTP input requires an interactive terminal')
  }

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  try {
    console.log('')
    console.log(`Publishing ${packageName}@${version}`)
    console.log('Use the current TOTP from your npm authenticator app or security key.')
    const answer = await readline.question('Npm OTP (blank if 2FA is disabled): ')
    return answer.trim()
  } finally {
    readline.close()
  }
}

function publish(artifact: string, otp: string) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    npm_config_registry: registry,
  }
  if (otp) env.npm_config_otp = otp

  run(['npm', 'publish', artifact, `--registry=${registry}`], env)
}

async function publishPackage(packageName: string, version: string, artifactName: string) {
  if (registryHasVersion(packageName, version)) {
    console.log(`Already published: ${packageName}@${version}`)
    return
  }

  const otp = await promptOtp(packageName, version)
  const artifact = join(artifactsDir, basename(artifactName))
  publish(artifact, otp)

  if (!registryHasVersion(packageName, version)) {
    throw new Error(`Publish finished but ${packageName}@${version} is not visible in npm`)
  }
  console.log(`Published: ${packageName}@${version}`)
}

async function main() {
  const whoami = capture(['npm', 'whoami', `--registry=${registry}`])
  if (whoami.exitCode !== 0) {
    throw new Error('Not logged in to npm. Run: npm login --registry=https://registry.npmjs.org/')
  }
  console.log(`Npm account: ${whoami.stdout.toString().trim()}`)

  run(['bun', 'run', 'pack:server'])
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ReleaseManifest
  const platformArtifact = manifest.artifacts.find((artifact) =>
    artifact.startsWith(`${manifest.platform}-`),
  )
  const mainArtifact = manifest.artifacts.find(
    (artifact) =>
      artifact.startsWith('localshare-server-') && !artifact.startsWith(`${manifest.platform}-`),
  )

  if (!platformArtifact || !mainArtifact) {
    throw new Error('Release manifest does not contain both npm artifacts')
  }

  await publishPackage(manifest.platform, manifest.version, platformArtifact)
  await publishPackage('localshare-server', manifest.version, mainArtifact)

  console.log('')
  console.log(`Published LocalShare ${manifest.version} successfully.`)
}

main().catch((error) => {
  console.error(`publish-npm: ${error.message}`)
  process.exitCode = 1
})
