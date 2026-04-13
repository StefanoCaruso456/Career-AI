import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@/": `${resolve(__dirname, ".")}/`,
      "server-only": `${resolve(__dirname, "test/stubs/server-only.ts")}`,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["**/*.test.ts", "**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
