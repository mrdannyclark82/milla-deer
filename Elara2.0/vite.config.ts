import path from 'path';

export default {
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  define: {
    'process.env.API_KEY': JSON.stringify(process.env.GEMINI_API_KEY ?? ''),
    'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY ?? ''),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
};
