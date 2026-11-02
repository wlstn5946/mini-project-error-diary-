import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // /api 요청을 백엔드(8000)로 전달한다. 그래서 백엔드에 CORS 설정이 없다. (API-SPEC 4절)
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
