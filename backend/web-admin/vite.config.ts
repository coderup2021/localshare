import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiPort = process.env.LOCALSHARE_API_PORT ?? '5678'

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  define: {
    __LOCALSHARE_API_PORT__: JSON.stringify(apiPort),
  },
  server: {
    host: '0.0.0.0',
    port: 7778,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
})
