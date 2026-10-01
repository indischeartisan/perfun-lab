import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      devOptions: { enabled: true },
      manifest: {
        name: 'Perfun Lab',
        short_name: 'Perfun',
        description: 'A digital fragrance playground.',
        theme_color: '#f4f0e7',
        background_color: '#f4f0e7',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2}'] }
    })
  ]
})
