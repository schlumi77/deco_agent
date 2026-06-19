import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Pull the version from the root package.json so the app reports a single,
// authoritative version number rather than a hardcoded string.
const rootPkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    // Mirror the "@shared/*" path alias from tsconfig.app.json so the dev
    // server (npm run web) resolves it the same way the production build does.
    alias: {
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})
