import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// base relativa: funciona em qualquer repositório do GitHub Pages
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["img/logo-hero.png", "img/logo-circle.png"],
      manifest: {
        name: "Duo Mariel",
        short_name: "Duo Mariel",
        description: "Repertório, pedidos de música e cifras do Duo Mariel",
        lang: "pt-BR",
        display: "standalone",
        background_color: "#0d0b09",
        theme_color: "#0d0b09",
        icons: [
          { src: "img/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "img/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "img/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // pdf.js é grande; garante que entre no precache
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            // PDFs de cifras: uma vez abertos, ficam disponíveis offline
            urlPattern: /supabase\.co\/storage\/v1\/object\/public\/cifras\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "cifras",
              expiration: { maxEntries: 300 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Dados do repertório/agenda/vídeos: rede primeiro, cache como reserva
            urlPattern: /supabase\.co\/rest\/v1\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "dados",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
