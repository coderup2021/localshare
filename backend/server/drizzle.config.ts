import { fileURLToPath } from 'node:url'
import { defineConfig } from 'drizzle-kit'

const defaultDatabaseUrl = fileURLToPath(new URL('../../.data/localshare.sqlite', import.meta.url))

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATA_DIR ? `${process.env.DATA_DIR}/localshare.sqlite` : defaultDatabaseUrl,
  },
})
