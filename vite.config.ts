import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH permet de déployer sous un sous-chemin (ex. GitHub Pages : /optcg-fr/).
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'One Piece TCG FR — Collection',
        short_name: 'OPTCG FR',
        description: 'Collection, scanner et suivi des prix Cardmarket pour One Piece Card Game (version française)',
        lang: 'fr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b1020',
        theme_color: '#0b1020',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,woff2}', 'icons/*.png'],
        // Les données (cartes, prix, empreintes) sont servies "réseau d'abord" pour être
        // toujours à jour, avec repli hors-ligne sur la dernière version en cache.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/data/') && url.pathname.endsWith('.json'),
            handler: 'NetworkFirst',
            options: { cacheName: 'optcg-data', networkTimeoutSeconds: 8, expiration: { maxEntries: 10 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/images/cards/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'optcg-images',
              expiration: { maxEntries: 4000, maxAgeSeconds: 60 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'cdn.jsdelivr.net' || url.hostname.endsWith('unpkg.com'),
            handler: 'CacheFirst',
            options: { cacheName: 'optcg-vendor', expiration: { maxEntries: 20 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  server: { host: true },
});
