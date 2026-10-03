import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// In development the browser calls /api/... on the Vite dev server, which forwards it to the
// Express backend (same origin, so no CORS setup needed). Production builds use VITE_API_URL instead.
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', setupFiles: ['./tests/setup.ts'] },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
