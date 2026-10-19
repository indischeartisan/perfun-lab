import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Deployment of this artifact requires an externally verified Cloudflare Access policy.
export default defineConfig({
  plugins: [react()],
  define: { 'import.meta.env.VITE_ENABLE_OPERATIONS_SIMULATOR': JSON.stringify('true') },
  build: { outDir: 'dist-admin-simulator', emptyOutDir: true, rollupOptions: { input: 'simulator-admin.html' } },
})
