import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The browser only ever talks to our backend. It never sees a Qloo key.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8787" } },
});
