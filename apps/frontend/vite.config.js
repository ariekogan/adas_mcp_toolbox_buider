import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.FRONTEND_PORT || '3312'),
    proxy: {
      '/voice-api': {
        target: process.env.VOICE_BACKEND_URL || 'http://localhost:4200',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/voice-api/, '/api'),
        ws: true
      },
      '/api': {
        target: process.env.VITE_API_URL || `http://localhost:${process.env.BACKEND_PORT || '4311'}`,
        changeOrigin: true
      }
    }
  }
});
