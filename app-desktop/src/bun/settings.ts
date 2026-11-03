import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'

const savedServerSchema = z.object({
  serverId: z.string().min(1),
  name: z.string().min(1).max(255),
  url: z.url().refine((value) => value.startsWith('http://') || value.startsWith('https://'), {
    message: 'Saved server URL must use HTTP or HTTPS',
  }),
  lastConnectedAt: z.iso.datetime(),
})

const desktopSettingsSchema = z.object({
  lastServer: savedServerSchema.nullable().default(null),
})

export type SavedServer = z.infer<typeof savedServerSchema>
export type DesktopSettings = z.infer<typeof desktopSettingsSchema>

export class SettingsStore {
  constructor(private readonly path: string) {}

  load(): DesktopSettings {
    try {
      return desktopSettingsSchema.parse(JSON.parse(readFileSync(this.path, 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { lastServer: null }
      }
      return { lastServer: null }
    }
  }

  saveLastServer(server: SavedServer): void {
    const settings = desktopSettingsSchema.parse({ lastServer: server })
    mkdirSync(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.${process.pid}.tmp`
    writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 })
    renameSync(temporary, this.path)
  }
}
