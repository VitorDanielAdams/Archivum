// Operações de alto nível sobre o vault: carregar, montar árvore, lembrar o último.
import { fsApi } from "./tauri";
import { docFromFile } from "./document";
import type { Doc, TreeNode } from "../types";

const LAST_VAULT_KEY = "archivum:lastVault";

export function getLastVault(): string | null {
  return localStorage.getItem(LAST_VAULT_KEY);
}
export function setLastVault(path: string): void {
  localStorage.setItem(LAST_VAULT_KEY, path);
}

export interface VaultData {
  docs: Doc[];
  dirs: string[];
}

// Varre o vault e devolve documentos parseados + a lista de pastas.
// `ignore` = pastas desabilitadas pelo usuário (além das podadas por padrão).
export async function loadVault(root: string, ignore: string[]): Promise<VaultData> {
  const scan = await fsApi.scanVault(root, ignore);
  const docs = scan.docs.map((d) => docFromFile(d.path, d.content));
  return { docs, dirs: scan.dirs };
}

// Monta a árvore de pastas/documentos.
// Só aparecem pastas que CONTÊM .md (direta ou indiretamente) — pastas sem
// nenhum documento não poluem a árvore (ex.: pastas de código num repositório).
export function buildTree(docs: Doc[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", type: "folder", children: [] };
  const folderMap = new Map<string, TreeNode>([["", root]]);

  function ensureFolder(folderPath: string): TreeNode {
    const existing = folderMap.get(folderPath);
    if (existing) return existing;
    const parts = folderPath.split("/");
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join("/");
    const parent = ensureFolder(parentPath);
    const node: TreeNode = { name, path: folderPath, type: "folder", children: [] };
    parent.children.push(node);
    folderMap.set(folderPath, node);
    return node;
  }

  for (const doc of docs) {
    const parts = doc.path.split("/");
    const folderPath = parts.slice(0, -1).join("/");
    const parent = ensureFolder(folderPath);
    parent.children.push({
      name: doc.meta.title,
      path: doc.path,
      type: "doc",
      docId: doc.meta.id,
      children: [],
    });
  }

  sortTree(root);
  return root.children;
}

// Pastas antes de docs; dentro de cada grupo, ordem alfabética.
function sortTree(node: TreeNode): void {
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, "pt-BR");
  });
  node.children.forEach(sortTree);
}
