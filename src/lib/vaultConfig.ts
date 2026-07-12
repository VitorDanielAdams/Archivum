// Configuração PRÓPRIA do vault (viaja com a pasta — portátil, como pedido).
// Guarda pastas ignoradas e pastas favoritas em ".archivum/config.json".
// Essa pasta já é ignorada pelo scan (ver PASTAS_IGNORADAS no Rust), então
// não aparece como documento nem pasta na árvore.
import { fsApi } from "./tauri";

const CONFIG_REL = ".archivum/config.json";

export interface VaultConfig {
  ignore: string[]; // pastas desabilitadas (nome ou caminho relativo)
  favoriteFolders: string[]; // pastas favoritas
}

const EMPTY: VaultConfig = { ignore: [], favoriteFolders: [] };

export async function loadVaultConfig(root: string): Promise<VaultConfig> {
  try {
    const raw = await fsApi.readDoc(root, CONFIG_REL);
    const parsed = JSON.parse(raw) as Partial<VaultConfig>;
    return {
      ignore: Array.isArray(parsed.ignore) ? parsed.ignore : [],
      favoriteFolders: Array.isArray(parsed.favoriteFolders) ? parsed.favoriteFolders : [],
    };
  } catch {
    return { ...EMPTY }; // primeiro uso: ainda não existe o arquivo
  }
}

export async function saveVaultConfig(root: string, config: VaultConfig): Promise<void> {
  await fsApi.writeDoc(root, CONFIG_REL, JSON.stringify(config, null, 2));
}
