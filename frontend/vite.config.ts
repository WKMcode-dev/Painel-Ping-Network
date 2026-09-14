import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const environment = loadEnv(mode, root, '')
  const port = process.env.PORT || environment.PORT || '3333'
  return {
    plugins: [react()],
    server: {
      host: true,
      proxy: {
        '/api': `http://127.0.0.1:${port}`,
        '/ws': { target: `ws://127.0.0.1:${port}`, ws: true },
      },
    },
  }
})
