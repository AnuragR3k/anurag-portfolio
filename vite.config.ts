import { resolve } from "node:path";
import { defineConfig } from "vite-plus";

export default defineConfig({
  base: "./",
  fmt: {},
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        skills: resolve(import.meta.dirname, "skills.html"),
        work: resolve(import.meta.dirname, "work.html"),
        about: resolve(import.meta.dirname, "about.html"),
        contact: resolve(import.meta.dirname, "contact.html"),
      },
    },
  },
  server: {
    allowedHosts: process.env.FREECODE_PREVIEW_HOST ? [process.env.FREECODE_PREVIEW_HOST] : [],
  },
});
