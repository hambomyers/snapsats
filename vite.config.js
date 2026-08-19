/**
 * Not in DEVELOPMENT.md's file tree. Vite cannot register vite-plugin-singlefile
 * from package.json alone; this file is the smallest way to emit the one-file
 * product the docs require. Deleting it would mean a multi-file dist/.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [
    viteSingleFile(),
    {
      // ES modules do not run from file://; the IIFE does as a classic script.
      name: "classic-script",
      closeBundle() {
        const p = "dist/index.html";
        const html = readFileSync(p, "utf8").replace(
          ' type="module" crossorigin',
          "",
        );
        writeFileSync(p, html);
      },
    },
  ],
  base: "./",
  build: {
    assetsInlineLimit: Infinity,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: "iife",
        name: "snapsats",
      },
    },
  },
  test: {
    environment: "node",
  },
});
