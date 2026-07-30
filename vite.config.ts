import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  // maplibre-gl resolves its web worker relative to its own module URL. The dep
  // optimizer rewrites that URL into .vite/deps, where no worker file exists, so
  // tile parsing silently never happens. Serving it unbundled keeps the relative
  // worker path intact.
  optimizeDeps: { exclude: ["maplibre-gl"] },
})
