import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Tauri expects a fixed port and fails if it is not available.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // Bind IPv4 explicitly: 'localhost' may resolve to ::1 and WebView2/Chrome then fail to connect.
    host: host || '127.0.0.1',
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    // WebView2 on Windows, WKWebView on macOS. Monaco needs ES2020+ (safari13 is too old).
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : process.env.TAURI_ENV_PLATFORM ? 'safari15' : 'es2022',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    chunkSizeWarningLimit: 1600,
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'monaco', test: /node_modules[\\/]monaco-editor/ },
            { name: 'xterm', test: /node_modules[\\/]@xterm/ },
            { name: 'motion', test: /node_modules[\\/]motion/ },
          ],
        },
      },
    },
  },
});
