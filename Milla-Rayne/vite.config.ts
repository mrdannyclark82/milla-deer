import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  root: 'client',
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:5000',
        ws: true,
      },
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client', 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
      '@assets': path.resolve(__dirname, 'attached_assets'),
      // Bypass @tanstack/custom-condition export key that confuses vite
      '@tanstack/react-query': '/home/nexus/ogdray/Milla-Deer/node_modules/.pnpm/@tanstack+react-query@5.90.12_react@19.2.4/node_modules/@tanstack/react-query/build/modern/index.js',
      '@tanstack/query-core': '/home/nexus/ogdray/Milla-Deer/node_modules/.pnpm/@tanstack+query-core@5.90.12/node_modules/@tanstack/query-core/build/modern/index.js',
    },
    dedupe: ['react', 'react-dom', '@tanstack/react-query', '@tanstack/query-core'],
    conditions: ['import', 'module', 'browser', 'default'],
  },
  optimizeDeps: {
    include: ['@tanstack/react-query'],
  },
};
