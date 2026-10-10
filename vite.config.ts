import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      // graphics-preview.html: standalone renderer test bed (graphics team)
      input: { main: resolve(__dirname, 'index.html'), graphicsPreview: resolve(__dirname, 'graphics-preview.html') },
      // three.js in its own long-cacheable chunk (shared by the game and the preview pages).
      output: { manualChunks: (id) => (id.includes('node_modules/three/') ? 'three' : undefined) },
    },
  },
  server: { port: 5173, strictPort: false },
  preview: { port: 4173 },
});
