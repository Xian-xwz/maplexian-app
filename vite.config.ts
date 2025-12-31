import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 关键配置：GitHub Pages 的仓库名称
  // 如果您的仓库名是 maplexian-app，这里的 base 必须是 '/maplexian-app/'
  base: '/maplexian-app/',
  build: {
    outDir: 'dist', // 输出目录，默认为 dist
    assetsDir: 'assets', // 静态资源目录
    sourcemap: false, // 生产环境通常不需要 sourcemap
  },
  server: {
    port: 3000,
    open: true
  }
});