import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standalone artifact: no entry point into the application or Admin simulator.
export default defineConfig({
  root: 'vendor-simulator',
  publicDir: '../public',
  plugins: [react(), {
    name: 'vendor-simulator-404',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '404.html', source: '<!doctype html><title>Not found</title><p>Not found.</p>' })
    },
  }],
  build: { outDir: '../dist-vendor-simulator', emptyOutDir: true },
})
