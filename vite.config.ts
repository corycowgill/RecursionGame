import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { precacheManifestPlugin } from './src/build/precacheManifest';

export default defineConfig({
  base: './',
  // Writes the service worker's precache manifest (hashed file list + content version) into dist/sw.js.
  plugins: [precacheManifestPlugin({ appEntry: 'main', appHtml: 'index.html' })],
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      // graphics-preview.html: standalone renderer test bed (graphics team). A separate entry: index.html never
      // loads its chunks, and the service worker does not precache them. (ui-preview.html is dev-server only.)
      input: { main: resolve(__dirname, 'index.html'), graphicsPreview: resolve(__dirname, 'graphics-preview.html') },
      // three.js in its own long-cacheable chunk (shared by the game and the preview pages).
      output: { manualChunks: (id) => (id.includes('node_modules/three/') ? 'three' : undefined) },
    },
  },
  server: { port: 5173, strictPort: false },
  preview: { port: 4173 },
});
