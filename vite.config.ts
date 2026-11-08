import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { assertStagingBuildEnvironment } from './scripts/staging-env.mjs'
import { reportPublicBuildEnvironment } from './scripts/public-build-env.mjs'

export default defineConfig(({ mode }) => {
  reportPublicBuildEnvironment(loadEnv(mode, '.', ''))
  if (mode === 'staging') assertStagingBuildEnvironment()
  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'icons/perfun-192.png', 'icons/perfun-512.png', 'icons/perfun-maskable-512.png'],
        devOptions: { enabled: true },
        manifest: {
          name: 'Perfun Lab',
          short_name: 'Perfun',
          description: 'A digital fragrance playground.',
          theme_color: '#f4f0e7',
          background_color: '#f4f0e7',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: '/icons/perfun-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/perfun-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/perfun-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
          ]
        },
        workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2,png,webp}'] }
      })
    ]
  }
})
