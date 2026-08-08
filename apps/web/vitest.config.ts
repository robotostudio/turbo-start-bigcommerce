import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Components under test are .tsx, and the web tsconfig sets `jsx: preserve`
  // for Next. Vite 8 (which Vitest now runs on) honours that and hands the
  // JSX through untransformed, which is not valid JS. `oxc` replaces the
  // `esbuild` option that carried this before; the two are not aliases, and
  // the deprecated one is ignored.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
