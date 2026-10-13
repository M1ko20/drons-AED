/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // relative base so the build works under a GitHub Pages sub-path (/drons-AED/)
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
