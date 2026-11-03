import { readFileSync, writeFileSync } from 'node:fs'

import { Data, NtExecutable, NtExecutableResource, Resource } from './vendor/resedit.mjs'

const DEFAULT_ICON_GROUP_ID = 1
const EN_US_LANGUAGE_ID = 1033

export function patchWindowsExecutableIcon(
  executablePath: string,
  iconPath: string,
  outputPath = executablePath,
) {
  const executable = NtExecutable.from(readFileSync(executablePath), { ignoreCert: true })
  const resources = NtExecutableResource.from(executable)
  const iconFile = Data.IconFile.from(readFileSync(iconPath))
  const icons = iconFile.icons.map((icon) => icon.data)
  const existingGroups = Resource.IconGroupEntry.fromEntries(resources.entries)

  if (existingGroups.length === 0) {
    Resource.IconGroupEntry.replaceIconsForResource(
      resources.entries,
      DEFAULT_ICON_GROUP_ID,
      EN_US_LANGUAGE_ID,
      icons,
    )
  } else {
    for (const group of existingGroups) {
      Resource.IconGroupEntry.replaceIconsForResource(
        resources.entries,
        group.id,
        group.lang,
        icons,
      )
    }
  }

  resources.outputResource(executable)
  const output = Buffer.from(executable.generate())
  const verifiedExecutable = NtExecutable.from(output, { ignoreCert: true })
  const verifiedResources = NtExecutableResource.from(verifiedExecutable)
  const verifiedGroups = Resource.IconGroupEntry.fromEntries(verifiedResources.entries)
  if (!verifiedGroups.some((group) => group.icons.length === iconFile.icons.length)) {
    throw new Error(`Failed to embed ${iconFile.icons.length} icon sizes into ${outputPath}`)
  }

  writeFileSync(outputPath, output)
}

if (import.meta.main) {
  const [executablePath, iconPath, outputPath] = process.argv.slice(2)
  if (!executablePath || !iconPath) {
    throw new Error(
      'Usage: bun run scripts/patch-windows-exe-icon.ts <executable> <icon.ico> [output]',
    )
  }
  patchWindowsExecutableIcon(executablePath, iconPath, outputPath)
}
