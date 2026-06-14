// apps/web/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/auth": "http://localhost:5000",
      "/admin": "http://localhost:5000",
      "/issues": "http://localhost:5000",
    },
  },
});
