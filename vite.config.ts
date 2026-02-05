import { defineConfig, type PluginOption } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

// Optional plugins - will be loaded if available
const loadOptionalPlugins = async (): Promise<PluginOption[]> => {
  const plugins: PluginOption[] = [];

  // Try to load rollup-plugin-visualizer
  try {
    const { visualizer } = await import('rollup-plugin-visualizer');
    plugins.push(
      visualizer({
        open: false,
        gzipSize: true,
        brotliSize: true,
        filename: 'dist/client/stats.html',
      }) as PluginOption
    );
  } catch {
    console.log('rollup-plugin-visualizer not installed, skipping bundle analysis');
  }

  // Try to load vite-plugin-imagemin
  try {
    const viteImagemin = (await import('vite-plugin-imagemin')).default;
    plugins.push(
      viteImagemin({
        gifsicle: { optimizationLevel: 7 },
        optipng: { optimizationLevel: 7 },
        mozjpeg: { quality: 80 },
        pngquant: { quality: [0.8, 0.9] },
        svgo: {
          plugins: [
            { name: 'removeViewBox', active: false },
            { name: 'removeEmptyAttrs', active: false },
          ],
        },
        webp: { quality: 80 },
      })
    );
  } catch {
    console.log('vite-plugin-imagemin not installed, skipping image optimization');
  }

  return plugins;
};

// https://vitejs.dev/config/
export default defineConfig(async () => {
  const optionalPlugins = await loadOptionalPlugins();

  return {
    plugins: [vue(), ...optionalPlugins],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@client': path.resolve(__dirname, './src/client'),
        '@core': path.resolve(__dirname, './src/core'),
        '@server': path.resolve(__dirname, './src/server'),
        '@db': path.resolve(__dirname, './src/db'),
        '@types': path.resolve(__dirname, './src/types'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
    define: {
      // Provide Sentry environment variable
      'import.meta.env.VITE_SENTRY_DSN': JSON.stringify(process.env.SENTRY_DSN || ''),
    },
    build: {
      outDir: 'dist/client',
      emptyOutDir: true,
      // Improve build performance
      sourcemap: false,
      // Optimize chunk size warnings
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          // Manual chunk splitting for better caching
          manualChunks: (id: string) => {
            // Vendor chunks - Core Vue ecosystem (combined to avoid circular deps)
            if (
              id.includes('node_modules/vue/') ||
              id.includes('node_modules/@vue/') ||
              id.includes('node_modules/vue-router/')
            ) {
              return 'vue-vendor';
            }
            // Pinia state management
            if (id.includes('node_modules/pinia/')) {
              return 'pinia';
            }
            // Element Plus UI library
            if (id.includes('node_modules/element-plus/')) {
              return 'element-plus';
            }
            // Element Plus Icons
            if (id.includes('node_modules/@element-plus/icons-vue/')) {
              return 'element-plus-icons';
            }
            // Third-party utilities
            if (id.includes('node_modules/nanoid/') || id.includes('node_modules/marked/')) {
              return 'utils';
            }

            // Route-based chunks (pages)
            if (id.includes('/src/client/pages/')) {
              const match = id.match(/\/pages\/([^/]+)\.vue/);
              if (match) {
                return `page-${match[1]}`;
              }
            }

            // Component chunks
            if (id.includes('/src/client/components/')) {
              // Large components that benefit from separate chunks
              if (id.includes('ChatWindow.vue') || id.includes('ChatSidebar.vue')) {
                return 'chat-components';
              }
              if (id.includes('Market.vue') || id.includes('CharacterCard.vue')) {
                return 'market-components';
              }
            }
          },
          // Asset naming with content hash for better caching
          assetFileNames: (assetInfo: { name: string }) => {
            if (/\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/i.test(assetInfo.name)) {
              return `assets/media/[name]-[hash][extname]`;
            }
            if (/\.(png|jpe?g|gif|svg|ico|webp)(\?.*)?$/i.test(assetInfo.name)) {
              return `assets/images/[name]-[hash][extname]`;
            }
            if (/\.(woff2?|eot|ttf|otf)(\?.*)?$/i.test(assetInfo.name)) {
              return `assets/fonts/[name]-[hash][extname]`;
            }
            return `assets/[name]-[hash][extname]`;
          },
          // Chunk naming with content hash
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
        },
      },
      // Optimize CSS
      cssCodeSplit: true,
    },
    // Optimize dependencies pre-bundling
    optimizeDeps: {
      include: [
        'vue',
        'vue-router',
        'pinia',
        'element-plus',
        '@element-plus/icons-vue',
        'marked',
        'nanoid',
      ],
    },
  };
});
