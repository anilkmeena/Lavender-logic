import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // CRITICAL: This ensures assets load correctly when deployed to a subdirectory (like on GitHub Pages)
  build: {
    outDir: 'dist',
  },
});