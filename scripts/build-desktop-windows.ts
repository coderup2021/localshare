import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { desktopBundleFolderName } from './desktop-package-naming'

const root = fileURLToPath(new URL('..', import.meta.url))
const desktopRoot = join(root, 'app-desktop')
const buildRoot = join(desktopRoot, 'build')
const artifactsRoot = join(desktopRoot, 'releases', 'windows-x64')
const appFolderName = 'LocalShareDesktop'
const runtimeCacheRoot = join(desktopRoot, '.cache', 'electrobun-2.0.5-win-x64')
const appName = 'LocalShare Desktop'
const appIdentifier = 'dev.localshare.desktop'
const appVersion = '0.1.0'
const channel = 'canary'
const bundleFolderName = desktopBundleFolderName(appName, channel)
const stagingRoot = join(buildRoot, bundleFolderName)
const installRootName = 'canary'
const releaseHash = 'winx64localsharecanary'
const hostPlatform = process.platform === 'darwin' ? 'macos' : process.platform
const referenceVersion = '2.1.1'
const referenceArtifactsRoot =
  process.env.LOCALSHARE_WINDOWS_REFERENCE_ROOT ??
  join(homedir(), 'study', 'task-time-electronbun', 'artifacts', referenceVersion)

function fail(message: string): never {
  throw new Error(message)
}

function run(command: string[], cwd = root) {
  const result = spawnSync(command[0] ?? fail('Empty command'), command.slice(1), {
    cwd,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    fail(`Command failed (${result.status ?? 'signal'}): ${command.join(' ')}`)
  }
}

function findFirst(rootPath: string, predicate: (path: string) => boolean): string | null {
  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    const path = join(rootPath, entry.name)
    if (entry.isDirectory()) {
      const nested = findFirst(path, predicate)
      if (nested) return nested
    } else if (predicate(path)) {
      return path
    }
  }
  return null
}

function referenceArtifact(suffix: string) {
  if (!existsSync(referenceArtifactsRoot)) {
    fail(
      `Electrobun Windows reference artifacts were not found at ${referenceArtifactsRoot}. Set LOCALSHARE_WINDOWS_REFERENCE_ROOT.`,
    )
  }
  const artifact = readdirSync(referenceArtifactsRoot).find((name) => name.endsWith(suffix))
  if (!artifact) fail(`Missing ${suffix} in ${referenceArtifactsRoot}`)
  return join(referenceArtifactsRoot, artifact)
}

function sha256(path: string) {
  return new Bun.CryptoHasher('sha256').update(readFileSync(path)).digest('hex')
}

function writeMetadata(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value)}\n`)
}

const temporaryRoot = mkdtempSync(join(tmpdir(), 'localshare-windows-build-'))
const referenceRoot = join(temporaryRoot, 'reference')
const macBundleRoot = join(temporaryRoot, 'mac-bundle')
const setupRoot = join(temporaryRoot, 'setup')

try {
  run(['bun', 'run', 'prepare:electrobun'], desktopRoot)
  run(['bun', 'run', 'build:view'], desktopRoot)
  run(['bunx', 'electrobun', 'build', '--env=canary'], desktopRoot)

  const macBuildDir = join(buildRoot, `canary-${hostPlatform}-${process.arch}`)
  const macArchive = findFirst(macBuildDir, (path) => path.endsWith('.tar.zst'))
  if (!macArchive) fail(`No macOS Electron app archive found under ${macBuildDir}`)

  mkdirSync(macBundleRoot, { recursive: true })
  const macTar = join(temporaryRoot, 'mac-bundle.tar')
  run(['zstd', '-d', '-f', '-o', macTar, macArchive])
  run(['tar', '-xf', macTar, '-C', macBundleRoot])
  const macMainBundle = findFirst(macBundleRoot, (path) => path.endsWith('/app/bun/index.js'))
  if (!macMainBundle) fail('Could not locate the built app resources in the macOS archive')
  const macResourcesApp = dirname(dirname(macMainBundle))

  const cachedLauncher = join(runtimeCacheRoot, 'bin', 'launcher.exe')
  if (!existsSync(cachedLauncher) || !existsSync(join(runtimeCacheRoot, 'installer.exe'))) {
    const referencePortable = referenceArtifact('-portable.zip')
    const referenceSetup = referenceArtifact('-Setup.zip')
    mkdirSync(referenceRoot, { recursive: true })
    run(['unzip', '-q', '-o', referencePortable, '-d', referenceRoot])
    const referenceLauncher = findFirst(
      referenceRoot,
      (path) =>
        path.endsWith('/bin/launcher.exe') &&
        existsSync(join(dirname(dirname(path)), 'Resources', 'main.js')),
    )
    if (!referenceLauncher) fail('Could not locate the Windows Electrobun runtime reference app')
    const referenceAppRoot = dirname(dirname(referenceLauncher))
    const referenceResources = join(referenceAppRoot, 'Resources')

    mkdirSync(runtimeCacheRoot, { recursive: true })
    cpSync(join(referenceAppRoot, 'bin'), join(runtimeCacheRoot, 'bin'), { recursive: true })
    cpSync(join(referenceResources, 'main.js'), join(runtimeCacheRoot, 'main.js'))
    cpSync(join(referenceResources, 'preload-full.js'), join(runtimeCacheRoot, 'preload-full.js'))
    cpSync(
      join(referenceResources, 'preload-sandboxed.js'),
      join(runtimeCacheRoot, 'preload-sandboxed.js'),
    )
    cpSync(join(referenceResources, 'uninstall'), join(runtimeCacheRoot, 'uninstall'))

    const setupEntries = spawnSync('unzip', ['-Z1', referenceSetup], {
      encoding: 'utf8',
    })
    if (setupEntries.status !== 0) fail(`Could not list ${referenceSetup}`)
    const referenceInstallerEntry = setupEntries.stdout
      .split(/\r?\n/)
      .find((entry) => entry.endsWith('.exe'))
    if (!referenceInstallerEntry) fail(`No installer executable found in ${referenceSetup}`)
    const referenceInstaller = spawnSync('unzip', ['-p', referenceSetup, referenceInstallerEntry], {
      maxBuffer: 16 * 1024 * 1024,
    })
    if (referenceInstaller.status !== 0 || !referenceInstaller.stdout) {
      fail(`Could not extract ${referenceInstallerEntry}`)
    }
    writeFileSync(join(runtimeCacheRoot, 'installer.exe'), referenceInstaller.stdout)
  }

  rmSync(stagingRoot, { recursive: true, force: true })
  const windowsBin = join(stagingRoot, 'bin')
  const windowsResources = join(stagingRoot, 'Resources')
  mkdirSync(windowsBin, { recursive: true })
  mkdirSync(windowsResources, { recursive: true })

  cpSync(join(runtimeCacheRoot, 'bin'), windowsBin, { recursive: true })
  cpSync(join(runtimeCacheRoot, 'main.js'), join(windowsResources, 'main.js'))
  cpSync(join(runtimeCacheRoot, 'preload-full.js'), join(windowsResources, 'preload-full.js'))
  cpSync(
    join(runtimeCacheRoot, 'preload-sandboxed.js'),
    join(windowsResources, 'preload-sandboxed.js'),
  )
  cpSync(join(runtimeCacheRoot, 'uninstall'), join(windowsResources, 'uninstall'))
  cpSync(macResourcesApp, join(windowsResources, 'app'), { recursive: true })

  const iconPng = join(temporaryRoot, 'LocalShareDesktop.png')
  const iconIco = join(temporaryRoot, 'LocalShareDesktop.ico')
  run([
    'sips',
    '-s',
    'format',
    'png',
    join(root, 'backend', 'web-user', 'public', 'favicon.svg'),
    '--out',
    iconPng,
  ])
  run(['sips', '-s', 'format', 'ico', iconPng, '--out', iconIco])
  cpSync(iconIco, join(windowsResources, 'AppIcon.ico'))

  writeMetadata(join(windowsResources, 'version.json'), {
    version: appVersion,
    hash: releaseHash,
    channel,
    baseUrl: '',
    name: bundleFolderName,
    displayName: appName,
    identifier: appIdentifier,
  })
  writeMetadata(join(windowsResources, 'build.json'), {
    mainProcess: 'bun',
    electrobunVersion: '2.0.5',
    runtimeVersions: { bun: '1.4.4' },
    defaultRenderer: 'native',
    availableRenderers: ['native'],
    buildEnvironment: channel,
    runtime: {},
  })

  mkdirSync(artifactsRoot, { recursive: true })
  const portableArtifact = join(
    artifactsRoot,
    `win-x64-${appFolderName}-${appVersion}-portable.zip`,
  )
  rmSync(portableArtifact, { force: true })
  run(['zip', '-qry', portableArtifact, bundleFolderName], buildRoot)

  const appTar = join(temporaryRoot, 'LocalShareDesktop.tar')
  const installArchive = join(temporaryRoot, 'LocalShareDesktop-Setup.tar.zst')
  run(['tar', '-cf', appTar, bundleFolderName], buildRoot)
  run(['zstd', '-q', '-f', '-o', installArchive, appTar])

  const referenceInstaller = readFileSync(join(runtimeCacheRoot, 'installer.exe'))

  const installerName = `${appFolderName}-${appVersion}-Setup.exe`
  const setupArtifactBase = `${appFolderName}-${appVersion}-Setup`
  mkdirSync(join(setupRoot, '.installer'), { recursive: true })
  writeFileSync(join(setupRoot, installerName), referenceInstaller)
  const setupMetadata = {
    identifier: appIdentifier,
    name: appName,
    channel,
    hash: releaseHash,
    install_root_name: installRootName,
  }
  writeMetadata(join(setupRoot, '.installer', `${setupArtifactBase}.metadata.json`), setupMetadata)
  cpSync(installArchive, join(setupRoot, '.installer', `${setupArtifactBase}.tar.zst`))

  const setupZip = join(artifactsRoot, `${setupArtifactBase}.zip`)
  rmSync(setupZip, { force: true })
  run(['zip', '-qry', setupZip, installerName, '.installer'], setupRoot)

  const standalone = Buffer.concat([
    referenceInstaller,
    Buffer.from('ELECTROBUN_METADATA_V1'),
    Buffer.from(JSON.stringify(setupMetadata)),
    Buffer.from('ELECTROBUN_ARCHIVE_V1'),
    readFileSync(installArchive),
  ])
  const standaloneArtifact = join(
    artifactsRoot,
    `${appFolderName}-${appVersion}-Setup-standalone.exe`,
  )
  writeFileSync(standaloneArtifact, standalone)

  const updateArtifactName = `${channel}-win-x64-${appFolderName}-${appVersion}.tar.zst`
  const updateArtifact = join(artifactsRoot, updateArtifactName)
  cpSync(installArchive, updateArtifact)
  const updateJson = join(artifactsRoot, `${channel}-win-x64-update.json`)
  writeMetadata(updateJson, {
    schemaVersion: 1,
    identifier: appIdentifier,
    channel,
    version: appVersion,
    hash: releaseHash,
    platform: 'win',
    arch: 'x64',
    artifact: { file: updateArtifactName },
  })

  const readmeArtifact = join(artifactsRoot, 'README-WINDOWS.txt')
  writeFileSync(
    readmeArtifact,
    [
      `LocalShare Desktop ${appVersion} - Windows x64`,
      '',
      'Recommended installer:',
      `  ${basename(setupZip)}`,
      '',
      'Extract the complete ZIP, including the hidden .installer folder, then run:',
      `  ${installerName}`,
      '',
      'Single-file installer:',
      `  ${basename(standaloneArtifact)}`,
      '',
      'Portable package:',
      `  ${basename(portableArtifact)}`,
      `  Extract it and run ${bundleFolderName}\\bin\\launcher.exe.`,
      '',
      'Requirements: Windows 10/11 x64 and Microsoft Edge WebView2 Runtime.',
      '',
      'This unsigned personal build was cross-assembled on macOS using the',
      'official Electrobun 2.0.5 Windows x64 runtime and Bun 1.4.4 x64.',
      'File structure and PE formats were validated, but runtime execution',
      'must still be verified on a Windows host.',
      '',
    ].join('\r\n'),
  )

  const generatedArtifacts = [
    portableArtifact,
    setupZip,
    standaloneArtifact,
    updateArtifact,
    updateJson,
    readmeArtifact,
  ]
  writeFileSync(
    join(artifactsRoot, 'SHA256SUMS-windows.txt'),
    `${generatedArtifacts.map((path) => `${sha256(path)}  ${basename(path)}`).join('\n')}\n`,
  )

  console.log('')
  console.log('Windows x64 package ready:')
  for (const path of generatedArtifacts) {
    console.log(`  ${relative(root, path)}`)
  }
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
