import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

const API_PORT = process.env.PORT || '4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
  server: {
    // Forward /api calls from the Vite dev server to the Express backend.
    proxy: {
      '/api': `http://localhost:${API_PORT}`,
    },
  },
});
