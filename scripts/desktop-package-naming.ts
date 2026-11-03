export type DesktopBuildChannel = 'stable' | 'canary' | 'dev'

/**
 * Electrobun's installer derives this name from the display name and channel.
 * The packaged application directory must match it exactly or installation
 * fails after the archive has been decompressed.
 */
export function desktopBundleFolderName(displayName: string, channel: DesktopBuildChannel): string {
  const sanitizedName = displayName.replaceAll(' ', '')
  return channel === 'stable' ? sanitizedName : `${sanitizedName}-${channel}`
}
