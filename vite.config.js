import { defineConfig } from "vite";
import { germanEditor } from "./scripts/monaco-de.mjs";
export default defineConfig({
  base: "./",
  plugins: [germanEditor()],
  build: { target: "es2022" },
  worker: { format: "iife" },
});
