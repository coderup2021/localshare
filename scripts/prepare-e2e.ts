import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const e2eDataDir = fileURLToPath(new URL('../.e2e-data', import.meta.url))
rmSync(e2eDataDir, { recursive: true, force: true })
