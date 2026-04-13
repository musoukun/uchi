import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import devServer from '@hono/vite-dev-server';

function socketIODevPlugin(): Plugin {
  return {
    name: 'socket-io-dev',
    configureServer(server) {
      return () => {
        if (!server.httpServer) return;
        import('./src/server/socket.js').then(({ initSocketIO }) => {
          initSocketIO(server.httpServer!);
          console.log('[vite] Socket.IO attached to dev server');
        }).catch((e) => {
          console.warn('[vite] Failed to attach Socket.IO:', e.message);
        });
      };
    },
  };
}

export default defineConfig(({ mode }) => {
  if (mode === 'client') {
    return {
      plugins: [react()],
      build: {
        outDir: 'dist/client',
        emptyOutDir: true,
      },
    };
  }

  return {
    plugins: [
      react(),
      socketIODevPlugin(),
      devServer({
        entry: 'src/server/index.ts',
        exclude: [
          /^\/@.+$/,
          /.*\.(ts|tsx|jsx|vue)($|\?)/,
          /.*\.(s?css|less)($|\?)/,
          /.*\.(svg|png|jpg|jpeg|gif|webp|woff2?)($|\?)/,
          /^\/(public|assets|static)\/.+/,
          /^\/node_modules\/.*/,
        ],
        injectClientScript: false,
      }),
    ],
    ssr: {
      external: ['@resvg/resvg-js', 'socket.io'],
    },
    optimizeDeps: {
      exclude: ['@resvg/resvg-js'],
    },
    build: {
      outDir: 'dist/server',
      emptyOutDir: true,
      ssr: true,
      target: 'node20',
      rollupOptions: {
        input: './src/server/index.ts',
        output: {
          entryFileNames: 'index.js',
          format: 'esm',
        },
      },
    },
  };
});
