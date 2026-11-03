export type ResourceEntry = unknown

export type IconItemData = unknown

export type PeExecutable = {
  generate(): Uint8Array
}

export type PeResource = {
  entries: ResourceEntry[]
  outputResource(executable: PeExecutable): void
}

export const NtExecutable: {
  from(data: Uint8Array, options?: { ignoreCert?: boolean }): PeExecutable
}

export const NtExecutableResource: {
  from(executable: PeExecutable): PeResource
}

export const Data: {
  IconFile: {
    from(data: Uint8Array): {
      icons: Array<{ data: IconItemData }>
    }
  }
}

export const Resource: {
  IconGroupEntry: {
    fromEntries(entries: readonly ResourceEntry[]): Array<{
      id: string | number
      lang: string | number
      icons: IconItemData[]
    }>
    replaceIconsForResource(
      entries: ResourceEntry[],
      iconGroupId: string | number,
      language: string | number,
      icons: IconItemData[],
    ): void
  }
}
