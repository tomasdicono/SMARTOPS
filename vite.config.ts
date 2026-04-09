import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * NOAA Aviation Weather no envía CORS; en dev el proxy evita bloqueo del navegador.
 * En producción: mismo path `/api/aviation` si el hosting reescribe a aviationweather.gov
 * (ver netlify.toml / vercel.json) o `VITE_AVIATION_WEATHER_BASE` apuntando a un proxy HTTPS.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api/aviation': {
        target: 'https://aviationweather.gov',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/aviation/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('User-Agent', 'SMARTOPS/1.0 (dashboard; +https://github.com/tomasdicono/SMARTOPS)')
          })
        },
      },
    },
  },
  preview: {
    proxy: {
      '/api/aviation': {
        target: 'https://aviationweather.gov',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/aviation/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('User-Agent', 'SMARTOPS/1.0 (dashboard; +https://github.com/tomasdicono/SMARTOPS)')
          })
        },
      },
    },
  },
})
