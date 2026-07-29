import { defineConfig } from '@hey-api/openapi-ts'
import { loadEnv } from 'vite'

const env = loadEnv('development', process.cwd(), '')
const backendUrl = env.VITE_BACKEND_URL || 'http://localhost:8000'

export default defineConfig({
  input: `${backendUrl}/openapi.json`,
  output: {
    path: 'src/api/generated',
  },
  plugins: [
    '@hey-api/typescript',
    '@hey-api/sdk',
    {
      name: '@hey-api/client-fetch',
    },
  ],
})
