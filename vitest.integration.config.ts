import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    restoreMocks: true,
    fileParallelism: false,
  },
});
