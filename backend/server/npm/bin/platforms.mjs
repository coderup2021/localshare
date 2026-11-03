import { readFileSync } from 'node:fs'

export const PLATFORM_TARGETS = JSON.parse(
  readFileSync(new URL('./platforms.json', import.meta.url), 'utf8'),
)

export function findPlatformTarget(platform, arch) {
  return PLATFORM_TARGETS.find(
    (candidate) => candidate.platform === platform && candidate.arch === arch,
  )
}

export function supportedPlatformLabels() {
  return PLATFORM_TARGETS.map((candidate) => candidate.label).join(', ')
}
