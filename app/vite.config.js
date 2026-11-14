import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// INLINE=1 genera un solo archivo (para la demo publicada); normal: build estándar.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: process.env.INLINE ? { assetsInlineLimit: 1e8, cssCodeSplit: false } : { assetsInlineLimit: 40000 }, // logo embebido: se ve sin señal
});
