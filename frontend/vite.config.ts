import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import inspectorBabelPlugin from './inspector/babel-plugin-inspect.mjs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = env.VITE_BACKEND_URL || 'http://localhost:8000'
  const isDev = mode === 'development'

  return {
    envPrefix: ['VITE_', 'COURSE_INFO_'],
    plugins: [
      react({
        babel: {
          plugins: [
            // Dev-only: stamp data-inspect-loc / data-inspect-name for the inspector overlay.
            ...(isDev ? [[inspectorBabelPlugin, { root: process.cwd() }]] : []),
            'babel-plugin-react-compiler',
          ],
        },
      }),
    ],
    server: {
      port: 5175,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
          ws: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => console.log('[Vite Proxy]', req.url));
            proxy.on('proxyRes', (proxyRes, req) => console.log('[Vite Proxy Response]', proxyRes.statusCode));
          }
        },
      },
      allowedHosts: ['hq-0588', 'localhost', '127.0.0.1', 'hq-0579'],
    },
    optimizeDeps: {
      include: ['d3', 'd3-selection', 'd3-transition'],
    },
    build: {
      // Emit .map files WITHOUT a sourceMappingURL comment in the JS: browsers
      // never load them, but ops can symbolicate production stack traces with
      // scripts/symbolicate.mjs. Note the backend serves dist via StaticFiles,
      // so exclude *.map when copying dist if they must not be downloadable.
      sourcemap: 'hidden',
    },
  }
})
