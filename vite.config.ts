import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Configuração do Vite afinada para Tauri.
// Porta fixa 1420 — o tauri.conf.json aponta devUrl para ela.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  // Tauri controla o terminal; não limpar a tela ajuda a ver erros do Rust.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    // Não observar a pasta do backend Rust (evita reloads desnecessários).
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
