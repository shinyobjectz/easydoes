import { cloudflare } from "@cloudflare/vite-plugin"
import tailwind from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  root: ".",
  plugins: [react(), tailwind(), cloudflare()],
  resolve: { alias: { "@shared": "/shared" } },
})
