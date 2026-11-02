import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 7778,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
})
