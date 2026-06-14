// apps/frontend/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Use 127.0.0.1 (IPv4), NOT "localhost": on macOS "localhost" resolves to
    // IPv6 ::1 first, where the AirPlay Receiver squats on port 5000 and would
    // intercept these requests (403 AirTunes). Flask binds 127.0.0.1:5000.
    proxy: {
      "/auth": "http://127.0.0.1:5000",
      "/admin": "http://127.0.0.1:5000",
      "/issues": "http://127.0.0.1:5000",
      "/agencies": "http://127.0.0.1:5000",
      "/team": "http://127.0.0.1:5000",
      "/seed": "http://127.0.0.1:5000",
      "/approvals": "http://127.0.0.1:5000",
    },
  },
});
