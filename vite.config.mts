import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Reachable from a phone on the same network, since that's where the game is meant to be played.
  server: { host: true },
  // three.js makes the game chunk large; it loads only after the title screen is up.
  build: { chunkSizeWarningLimit: 800 },
});
