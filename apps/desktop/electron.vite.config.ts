import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const sharedAlias = {
  /**
   * Resolve the workspace package to TS source: its published build is
   * CommonJS, and Vite's pre-bundle of it goes stale whenever shared
   * gains exports, breaking named imports until the cache is cleared.
   */
  "@blackbox/shared": resolve("../../packages/shared/src/index.ts"),
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["@blackbox/shared"] })],
    resolve: { alias: sharedAlias },
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/main/index.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ["@blackbox/shared"] })],
    resolve: { alias: sharedAlias },
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/preload/index.ts"),
        },
      },
    },
  },
  renderer: {
    root: resolve("src/renderer"),
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        ...sharedAlias,
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/renderer/index.html"),
        },
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
