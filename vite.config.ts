import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { apiPlugin } from './vite-plugin-api'

// Vite serves the React app; the Cloudflare Worker in ./worker serves /api/*
// in production (Canvas read-only proxy). In dev, vite-plugin-api.ts mounts the
// same handler so the page behaves identically on localhost.
export default defineConfig({
  plugins: [react(), tailwindcss(), apiPlugin()],
  server: {
    port: Number(process.env.PORT) || 5190,
  },
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
})
