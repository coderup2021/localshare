import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

const apiTarget = 'http://127.0.0.1:5678'
const adminTarget = 'http://127.0.0.1:7778'

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 7777,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiTarget,
        configure(proxy) {
          proxy.on('proxyReq', (proxyRequest, request) => {
            proxyRequest.setHeader(
              'x-localshare-client-ip',
              request.socket.remoteAddress ?? 'unknown',
            )
          })
        },
      },
      '/ws': {
        target: apiTarget,
        ws: true,
      },
      '/admin': {
        target: adminTarget,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
