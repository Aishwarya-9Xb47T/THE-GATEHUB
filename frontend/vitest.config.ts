import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: [
      "src/assessment-platform/**/*.test.ts",
      "src/components/**/*.test.{ts,tsx}",
      "src/lib/liveSession/**/*.test.ts",
      "src/lib/contentBuilder/**/*.test.ts",
      "src/lib/classroom/**/*.test.ts",
      "src/lib/pptxSvgPostProcess.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
