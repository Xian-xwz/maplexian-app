import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/maplexian-app/', // 必须改成你的仓库名,前后都要有斜杠
  build: {
    outDir: 'dist', // 输出目录，默认为 dist
    assetsDir: 'assets', // 静态资源目录
    sourcemap: false, // 生产环境通常不需要 sourcemap
  },
  server: {
    port: 3000,
    open: true
  }
})