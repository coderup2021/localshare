import { isAbsolute, relative, sep } from 'node:path'

export type PathApi = {
  isAbsolute: typeof isAbsolute
  relative: typeof relative
  sep: typeof sep
}

export function isPathWithin(
  root: string,
  candidate: string,
  paths: PathApi = {
    isAbsolute,
    relative,
    sep,
  },
) {
  const relativePath = paths.relative(root, candidate)
  return (
    relativePath !== '' &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${paths.sep}`) &&
    !paths.isAbsolute(relativePath)
  )
}
