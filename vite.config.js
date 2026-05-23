import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // สำคัญที่สุดสำหรับการอัพขึ้น GitHub Pages เพื่อให้โหลดไฟล์ทรัพยากรแบบสัมพัทธ์ได้สำเร็จ
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
});
