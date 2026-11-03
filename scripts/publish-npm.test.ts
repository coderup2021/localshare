import { describe, expect, test } from 'bun:test'
import { findReusableStage, type StagedPackage } from './publish-npm'

const existingStage: StagedPackage = {
  packageName: 'localshare-server-linux-x64',
  version: '0.2.0',
  shasum: 'abc123',
  status: 'staged',
}

describe('findReusableStage', () => {
  test('skips an identical staged package', () => {
    expect(
      findReusableStage([existingStage], 'localshare-server-linux-x64', '0.2.0', 'abc123'),
    ).toEqual(existingStage)
  })

  test('stages a package when the version is not already staged', () => {
    expect(
      findReusableStage([existingStage], 'localshare-server-linux-x64', '0.2.1', 'abc123'),
    ).toBeUndefined()
  })

  test('rejects a staged version with different content', () => {
    expect(() =>
      findReusableStage([existingStage], 'localshare-server-linux-x64', '0.2.0', 'different'),
    ).toThrow('local artifact is different')
  })
})
