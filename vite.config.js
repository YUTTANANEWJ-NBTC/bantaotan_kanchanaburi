import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './', // สำคัญสำหรับ Github Pages เพื่อให้โหลดไฟล์แบบสัมพัทธ์ได้สำเร็จ
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),      // ทางเข้าหลัก (Mode น้ำลด)
        lowWater: resolve(__dirname, 'index6.1.html'), // โหมดน้ำลดสำรอง
        fullWater: resolve(__dirname, 'index7.html'),   // โหมดน้ำเต็มเขื่อน
        osmLowWater: resolve(__dirname, 'index8.1.html'), // ใหม่! โหมดน้ำลด OpenStreetMap Bounding Box
        osmFullWater: resolve(__dirname, 'index8.2.html') // ใหม่! โหมดน้ำเต็มเขื่อน OpenStreetMap Bounding Box
      }
    }
  }
});
