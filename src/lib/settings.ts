// Configurações do app: atalho global + iniciar com o sistema.
import { invoke } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

const SHORTCUT_KEY = "archivum:shortcut";
export const DEFAULT_SHORTCUT = "Ctrl+Shift+Space";

export function getShortcut(): string {
  return localStorage.getItem(SHORTCUT_KEY) || DEFAULT_SHORTCUT;
}

// Registra o atalho no Rust e guarda a preferência.
export async function applyShortcut(accelerator: string): Promise<void> {
  await invoke("set_shortcut", { accelerator });
  localStorage.setItem(SHORTCUT_KEY, accelerator);
}

export const autostart = {
  isEnabled: () => isEnabled(),
  enable: () => enable(),
  disable: () => disable(),
};
