import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/main/index.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
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
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/renderer/index.html"),
        },
      },
      commonjsOptions: {
        include: [/node_modules/, /packages\/shared/],
        transformMixedEsModules: true,
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
