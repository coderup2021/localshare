import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src/mainview',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      'electrobun/view': resolve(import.meta.dirname, '.hutch/devkit/api/browser/index.ts'),
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
