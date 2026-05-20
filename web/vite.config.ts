import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function isReactVendor(id: string): boolean {
  return (
    /node_modules\/react\//.test(id) ||
    /node_modules\/react-dom\//.test(id) ||
    /node_modules\/react-router-dom\//.test(id) ||
    /node_modules\/react-router\//.test(id) ||
    /node_modules\/scheduler\//.test(id)
  )
}

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (isReactVendor(id)) return 'react'
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) return 'recharts'
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      '/v1': 'http://localhost:8787',
    },
  },
})
