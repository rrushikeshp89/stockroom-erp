import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 4000 falls inside a range Windows (Hyper-V/WinNAT) can reserve, so the API defaults to 5180.
    proxy: { '/api': `http://localhost:${process.env.API_PORT || 5180}` },
  },
});
