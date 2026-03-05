import { defineConfig } from "vitest/config";
import { vitestSetupFilePath } from "@stacks/clarinet-sdk/vitest";

export default defineConfig({
  test: {
    environment: "clarinet",
    globals: true,
    setupFiles: [vitestSetupFilePath],
    pool: "forks",
    environmentOptions: {
      clarinet: {
        manifestPath: "./Clarinet.toml",
        initBeforeEach: true,
        coverage: false,
        costs: false,
      },
    },
  },
});
