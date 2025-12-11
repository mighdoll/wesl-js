import { defineConfig } from "vite";

export default defineConfig({
  server: {
    fs: {
      // Allow serving files from sibling packages for dev mode testing
      allow: [".."],
    },
  },
});
