import { defineConfig } from 'vite';

// Ehitab veebiversiooni kausta dist/, mille Capacitor pakib Androidi äpi sisse.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020'
  }
});
