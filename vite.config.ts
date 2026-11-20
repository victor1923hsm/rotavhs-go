import { copyFileSync, existsSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Cores do manifesto: só aqui e no index.html (o sistema operacional não lê CSS).
// Valores = tokens de src/styles/tokens.css (fundo do tema Sol e cor da barra).
const COR_FUNDO = '#FFFFFF'
const COR_TEMA = '#171B19'

// Endereço base: '/' no PC (npm run preview); '/rotavhs-go/' no GitHub Pages (definido no workflow).
const BASE = process.env.BASE_PATH ?? '/'

/** GitHub Pages não conhece as rotas do app: o 404.html (cópia do index.html) abre o app em qualquer endereço. */
const pagina404 = (): Plugin => ({
  name: 'rotavhs-404',
  apply: 'build',
  closeBundle() {
    const dist = fileURLToPath(new URL('./dist', import.meta.url))
    if (existsSync(`${dist}/index.html`)) copyFileSync(`${dist}/index.html`, `${dist}/404.html`)
    // Protótipo (P1): a planilha FICTÍCIA de teste vai junto, para testar a importação sem dado real.
    if (process.env.VITE_PROTOTIPO === '1') {
      const ficticia = fileURLToPath(new URL('./test-fixtures/planilhas/11-formato-spx.xlsx', import.meta.url))
      copyFileSync(ficticia, `${dist}/exemplo-spx-ficticia.xlsx`)
    }
  },
})

export default defineConfig({
  base: BASE,
  plugins: [
    pagina404(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'RotaVHS Go',
        short_name: 'RotaVHS Go',
        description: 'Rotas de entrega: importar, conferir, rodar e marcar.',
        lang: 'pt-BR',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: COR_FUNDO,
        theme_color: COR_TEMA,
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App inteiro em precache (abre offline), inclusive o bloco do mapa.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webmanifest}'],
        // Planilhas nunca vão para o cache do app (nem a fictícia). As do aparelho nem passam pela rede.
        globIgnores: ['**/*.{xlsx,xls,csv}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Lição do RotaVHS: sem estes dois, a versão nova fica "esperando".
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // Tiles e estilo do OpenFreeMap: só os já vistos (G6). Sem garantia de cobertura.
            urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'mapa-tiles',
              // ~60 MB (G6): o Workbox limita por quantidade; ~40 KB por tile → 1500 tiles.
              expiration: { maxEntries: 1500, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 1200 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
