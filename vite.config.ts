import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Multiplayer room WebSocket → npm run server (port 3001)
      '/ws': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
})
