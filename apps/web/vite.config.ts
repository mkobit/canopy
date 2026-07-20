import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'canopy:graph/draft-session': fileURLToPath(new URL('./src/plugin/draft-session-shim.ts', import.meta.url)),
    },
  },
});
