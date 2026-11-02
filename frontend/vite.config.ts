import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  preview: {
    host: "127.0.0.1",
    proxy: {
      "/api": { target: process.env.API_PROXY_TARGET || "http://127.0.0.1:3000", changeOrigin: true },
      "/health": { target: process.env.API_PROXY_TARGET || "http://127.0.0.1:3000", changeOrigin: true },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: process.env.API_PROXY_TARGET || "http://127.0.0.1:3000", changeOrigin: true },
      "/health": { target: process.env.API_PROXY_TARGET || "http://127.0.0.1:3000", changeOrigin: true },
    },
  },
});
