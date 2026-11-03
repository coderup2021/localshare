const releaseVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/

export function normalizeReleaseVersion(value: string): string {
  const normalized = value.trim().replace(/^v/i, '')
  const match = releaseVersionPattern.exec(normalized)
  if (!match) {
    throw new Error('Version must be a valid SemVer without build metadata, for example 0.2.1')
  }

  const prerelease = match[4]
  if (
    prerelease
      ?.split('.')
      .some(
        (identifier) =>
          /^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith('0'),
      )
  ) {
    throw new Error('Numeric prerelease identifiers must not contain leading zeros')
  }
  return normalized
}

export function defaultNextReleaseVersion(current: string): string {
  const normalized = normalizeReleaseVersion(current)
  const match = releaseVersionPattern.exec(normalized)
  if (!match) throw new Error(`Invalid current version: ${current}`)
  const core = `${match[1]}.${match[2]}.${match[3]}`
  const prerelease = match[4]
  const [major = 0, minor = 0, patch = 0] = [match[1], match[2], match[3]].map(Number)

  if (!prerelease) return `${major}.${minor}.${patch + 1}`

  const identifiers = prerelease.split('.')
  for (let index = identifiers.length - 1; index >= 0; index -= 1) {
    const identifier = identifiers[index]
    if (identifier && /^\d+$/.test(identifier)) {
      identifiers[index] = String(Number(identifier) + 1)
      return `${core}-${identifiers.join('.')}`
    }
  }
  return `${core}-${prerelease}.1`
}
