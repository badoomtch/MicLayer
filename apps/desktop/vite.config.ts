import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri runs Vite as the dev server; these defaults match the recommended
// Tauri 2 setup. See https://tauri.app/v1/guides/getting-started/setup/vite/.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: '127.0.0.1',
    hmr: { protocol: 'ws', host: '127.0.0.1', port: 1421 },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
