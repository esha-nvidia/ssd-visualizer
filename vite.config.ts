import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __VERSION__: JSON.stringify('0.16.34'),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('react-dom') || id.includes('/react/')) return 'react-vendor'
          if (id.includes('framer-motion')) return 'motion'
          if (id.includes('@radix-ui')) return 'radix'
          if (id.includes('katex')) return 'katex'
          return 'vendor'
        },
      },
    },
  },
})
