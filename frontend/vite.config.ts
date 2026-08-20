import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@gatehub/lesson-body": path.resolve(__dirname, "../shared/lesson-body/index.ts"),
    },
  },
  cacheDir: 'node_modules/.vite',
  optimizeDeps: {
    include: ["pdfjs-dist", "react-pdf"],
    exclude: ["pptx-svg"],
  },
  assetsInclude: ["**/*.wasm"],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/monaco-editor") || id.includes("@monaco-editor")) {
            return "monaco";
          }
          if (id.includes("pdfjs-dist") || id.includes("react-pdf")) {
            return "pdf";
          }
          if (id.includes("node_modules/yjs") || id.includes("y-monaco") || id.includes("y-websocket")) {
            return "collab";
          }
          if (id.includes("node_modules/framer-motion")) {
            return "framer-motion";
          }
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
    proxy: {
      "/api": { target: "http://localhost:5000", changeOrigin: true, timeout: 300_000 },
      "/uploads": { target: "http://localhost:5000", changeOrigin: true, timeout: 120_000 },
      "/yjs": { target: "ws://localhost:5000", ws: true, changeOrigin: true },
      "/live-sessions": { target: "ws://localhost:5000", ws: true, changeOrigin: true },
      "/ws/classroom-studio": { target: "ws://localhost:5000", ws: true, changeOrigin: true },
    } 
  },
});
