import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.FRONTEND_PORT || '3312'),
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || `http://localhost:${process.env.BACKEND_PORT || '4311'}`,
        changeOrigin: true
      }
    }
  }
});
