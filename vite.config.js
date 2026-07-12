import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base relativa: funciona em qualquer repositório do GitHub Pages
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
});
