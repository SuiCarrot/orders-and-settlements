import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    coverage: {
      include: ["src/server/domain/**", "src/server/services/**"],
    },
  },
});
