import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on IPv4 + IPv6 so both localhost and 127.0.0.1 work
    host: true,
    proxy: {
      // Multiplayer room WebSocket → npm run server (port 3001)
      '/ws': {
        target: 'http://localhost:3001',
        ws: true,
      },
      // Open Kit live manifest + PNG files → npm run server
      '/kit': {
        target: 'http://localhost:3001',
      },
      // Browser → Vite → Ollama directly (no Node/undici fetch hop)
      '/ollama': {
        target: 'http://127.0.0.1:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ollama/, ''),
      },
      // Board MCP token (Settings) + MCP HTTP → room server
      '/mcp': {
        target: 'http://localhost:3001',
      },
      // Shoulder xAI Grok → room server proxy → api.x.ai
      '/xai': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
