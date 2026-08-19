/**
 * Not in DEVELOPMENT.md's file tree. Vite cannot register vite-plugin-singlefile
 * from package.json alone; this file is the smallest way to emit the one-file
 * product the docs require. Deleting it would mean a multi-file dist/.
 */
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  base: "./",
  build: {
    assetsInlineLimit: Infinity,
    cssCodeSplit: false,
  },
  test: {
    environment: "node",
  },
});
