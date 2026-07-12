// Ponte fina entre o frontend e os comandos Rust (e o diálogo nativo).
import { invoke } from "@tauri-apps/api/core";
import { ask, open } from "@tauri-apps/plugin-dialog";

export interface DocFileRaw {
  path: string;
  content: string;
}
export interface VaultScanResult {
  dirs: string[];
  docs: DocFileRaw[];
}

export const fsApi = {
  scanVault: (root: string, ignore: string[]) =>
    invoke<VaultScanResult>("scan_vault", { root, ignore }),
  readDoc: (root: string, rel: string) => invoke<string>("read_doc_file", { root, rel }),
  writeDoc: (root: string, rel: string, content: string) =>
    invoke<void>("write_doc_file", { root, rel, content }),
  createDir: (root: string, rel: string) => invoke<void>("create_dir", { root, rel }),
  renamePath: (root: string, from: string, to: string) =>
    invoke<void>("rename_path", { root, from, to }),
  removePath: (root: string, rel: string, recursive: boolean) =>
    invoke<void>("remove_path", { root, rel, recursive }),
};

// Abre o seletor nativo de pasta. Devolve o caminho ou null se cancelado.
// Desliga o auto-hide enquanto o diálogo está aberto (senão o painel some).
export async function pickVaultFolder(): Promise<string | null> {
  await invoke("allow_autohide", { enabled: false });
  try {
    const result = await open({
      directory: true,
      multiple: false,
      title: "Escolha a pasta do vault do Archivum",
    });
    return typeof result === "string" ? result : null;
  } finally {
    await invoke("allow_autohide", { enabled: true });
  }
}

// Confirmação nativa (sim/não). Desliga o auto-hide enquanto o diálogo aparece.
export async function askConfirm(message: string): Promise<boolean> {
  await invoke("allow_autohide", { enabled: false });
  try {
    return await ask(message, { title: "Archivum", kind: "warning" });
  } finally {
    await invoke("allow_autohide", { enabled: true });
  }
}
